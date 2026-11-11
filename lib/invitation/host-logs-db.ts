import 'server-only';

import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { giftLogs, guestLogs, guests, invitations, seatingTables } from '@/lib/db/schema';
import {
  MAX_GIFTS,
  MAX_TABLES,
  familySidesApply,
  isGiftKind,
  parseFamilySide,
  type FamilySide,
  type GiftKind,
  type GiftLogRow,
  type GuestLogRow,
  type SeatingTable,
} from './host-logs';

/**
 * G-045 (D-058): the only writer of `seating_tables`, `guest_logs` and `gift_logs` (migration 0024), a host-logs domain
 * with one Next.js writer (ADR-A2: it moves to Rust as one domain, behind its own `BACKEND_*`, if it ever does). Every
 * write takes the owner's invitation row lock and re-checks ownership, then checks that each guest, table or entry id
 * belongs to that invitation, so a forged id from another invitation changes nothing. The pages and actions ask
 * `accessFor(…, 'manage')` (owner only) and `FLAG_HOST_LOGS` first.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The owner's invitation, locked for this write; null when it is not this owner's. */
async function lockOwned(tx: Tx, ownerId: number, invitationId: number): Promise<{ eventType: string } | null> {
  const [row] = await tx
    .select({ eventType: invitations.eventType })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.userId, ownerId), isNull(invitations.deletedAt)))
    .for('update');
  return row ?? null;
}

async function guestOf(tx: Tx, invitationId: number, guestId: number) {
  const [row] = await tx
    .select({ id: guests.id, name: guests.name })
    .from(guests)
    .where(and(eq(guests.id, guestId), eq(guests.invitationId, invitationId)));
  return row ?? null;
}

async function tableOf(tx: Tx, invitationId: number, tableId: number): Promise<boolean> {
  const [row] = await tx
    .select({ id: seatingTables.id })
    .from(seatingTables)
    .where(and(eq(seatingTables.id, tableId), eq(seatingTables.invitationId, invitationId)));
  return Boolean(row);
}

export type HostLogs = { tables: SeatingTable[]; guests: GuestLogRow[]; gifts: GiftLogRow[] };

/** Everything the owner's logs page and its exports show, for one invitation (its access is checked by the caller). */
export async function loadHostLogs(invitationId: number): Promise<HostLogs> {
  const [tables, rows, gifts] = await Promise.all([
    db
      .select({ id: seatingTables.id, name: seatingTables.name, capacity: seatingTables.capacity })
      .from(seatingTables)
      .where(eq(seatingTables.invitationId, invitationId))
      .orderBy(asc(seatingTables.name), asc(seatingTables.id)),
    db
      .select({
        guestId: guests.id,
        name: guests.name,
        category: guests.category,
        tableId: guestLogs.tableId,
        seat: guestLogs.seat,
        souvenirAt: guestLogs.souvenirAt,
        checkedInAt: guests.checkedInAt,
      })
      .from(guests)
      .leftJoin(guestLogs, eq(guestLogs.guestId, guests.id))
      .where(eq(guests.invitationId, invitationId))
      .orderBy(asc(guests.name), asc(guests.id)),
    db
      .select({
        id: giftLogs.id,
        guestId: giftLogs.guestId,
        giverName: giftLogs.giverName,
        kind: giftLogs.kind,
        amount: giftLogs.amount,
        note: giftLogs.note,
        receivedAt: giftLogs.receivedAt,
        side: giftLogs.familySide,
      })
      .from(giftLogs)
      .where(eq(giftLogs.invitationId, invitationId))
      .orderBy(desc(giftLogs.receivedAt), desc(giftLogs.id)),
  ]);
  return {
    tables,
    guests: rows.map((row) => ({ ...row, tableId: row.tableId ?? null, seat: row.seat ?? null, souvenirAt: row.souvenirAt ?? null })),
    gifts: gifts.map((gift) => {
      const side = parseFamilySide(gift.side);
      return { ...gift, kind: isGiftKind(gift.kind) ? gift.kind : 'other', side: side.ok ? side.value : null };
    }),
  };
}

export type TableOutcome = { kind: 'saved' } | { kind: 'duplicate' } | { kind: 'full' } | { kind: 'notfound' };

export async function addTable(ownerId: number, invitationId: number, input: { name: string; capacity: number | null }): Promise<TableOutcome> {
  return db.transaction(async (tx) => {
    if (!(await lockOwned(tx, ownerId, invitationId))) return { kind: 'notfound' };
    const [{ n }] = await tx.select({ n: count() }).from(seatingTables).where(eq(seatingTables.invitationId, invitationId));
    if (n >= MAX_TABLES) return { kind: 'full' };
    const [row] = await tx
      .insert(seatingTables)
      .values({ invitationId, name: input.name, capacity: input.capacity })
      .onConflictDoNothing({ target: [seatingTables.invitationId, seatingTables.name] })
      .returning({ id: seatingTables.id });
    return row ? { kind: 'saved' } : { kind: 'duplicate' };
  });
}

export async function updateTable(ownerId: number, invitationId: number, tableId: number, input: { name: string; capacity: number | null }): Promise<TableOutcome> {
  return db.transaction(async (tx) => {
    if (!(await lockOwned(tx, ownerId, invitationId)) || !(await tableOf(tx, invitationId, tableId))) return { kind: 'notfound' };
    const [clash] = await tx
      .select({ id: seatingTables.id })
      .from(seatingTables)
      .where(and(eq(seatingTables.invitationId, invitationId), eq(seatingTables.name, input.name), ne(seatingTables.id, tableId)));
    if (clash) return { kind: 'duplicate' };
    await tx.update(seatingTables).set({ name: input.name, capacity: input.capacity }).where(eq(seatingTables.id, tableId));
    return { kind: 'saved' };
  });
}

/** Copies the planned tables in (`planTables`); names already in the log are skipped, so a repeat adds nothing. */
export async function importTables(
  ownerId: number,
  invitationId: number,
  tables: readonly { name: string; capacity: number | null }[],
): Promise<{ kind: 'imported'; added: number } | { kind: 'full' } | { kind: 'notfound' }> {
  return db.transaction(async (tx) => {
    if (!(await lockOwned(tx, ownerId, invitationId))) return { kind: 'notfound' };
    const [{ n }] = await tx.select({ n: count() }).from(seatingTables).where(eq(seatingTables.invitationId, invitationId));
    const room = MAX_TABLES - n;
    if (room <= 0 && tables.length) return { kind: 'full' };
    const rows = tables.slice(0, Math.max(room, 0)).map((table) => ({ invitationId, name: table.name, capacity: table.capacity }));
    if (!rows.length) return { kind: 'imported', added: 0 };
    const added = await tx
      .insert(seatingTables)
      .values(rows)
      .onConflictDoNothing({ target: [seatingTables.invitationId, seatingTables.name] })
      .returning({ id: seatingTables.id });
    return { kind: 'imported', added: added.length };
  });
}

/** Removes a table; its guests become unseated (`on delete set null`) and their seat labels, which named its chairs, go too. */
export async function deleteTable(ownerId: number, invitationId: number, tableId: number, now: Date = new Date()): Promise<'deleted' | 'notfound'> {
  return db.transaction(async (tx) => {
    if (!(await lockOwned(tx, ownerId, invitationId))) return 'notfound';
    await tx
      .update(guestLogs)
      .set({ seat: null, updatedAt: now })
      .where(and(eq(guestLogs.invitationId, invitationId), eq(guestLogs.tableId, tableId)));
    const removed = await tx
      .delete(seatingTables)
      .where(and(eq(seatingTables.id, tableId), eq(seatingTables.invitationId, invitationId)))
      .returning({ id: seatingTables.id });
    return removed.length ? 'deleted' : 'notfound';
  });
}

/** Seats a guest at one of this invitation's tables (or none), with an optional seat label. Saving it again is a no-op. */
export async function assignSeat(
  ownerId: number,
  invitationId: number,
  guestId: number,
  input: { tableId: number | null; seat: string | null },
  now: Date = new Date(),
): Promise<'saved' | 'notfound'> {
  return db.transaction(async (tx) => {
    if (!(await lockOwned(tx, ownerId, invitationId)) || !(await guestOf(tx, invitationId, guestId))) return 'notfound';
    if (input.tableId !== null && !(await tableOf(tx, invitationId, input.tableId))) return 'notfound';
    await tx
      .insert(guestLogs)
      .values({ guestId, invitationId, tableId: input.tableId, seat: input.seat, updatedAt: now })
      .onConflictDoUpdate({ target: guestLogs.guestId, set: { tableId: input.tableId, seat: input.seat, updatedAt: now } });
    return 'saved';
  });
}

export type SouvenirOutcome = { kind: 'given'; at: Date; first: boolean } | { kind: 'cleared' } | { kind: 'notfound' };

/** Marks a souvenir handed out (the first time is kept, as a first arrival is) or clears it. */
export async function setSouvenir(ownerId: number, invitationId: number, guestId: number, given: boolean, now: Date = new Date()): Promise<SouvenirOutcome> {
  return db.transaction(async (tx) => {
    if (!(await lockOwned(tx, ownerId, invitationId)) || !(await guestOf(tx, invitationId, guestId))) return { kind: 'notfound' };
    if (!given) {
      await tx.update(guestLogs).set({ souvenirAt: null, updatedAt: now }).where(eq(guestLogs.guestId, guestId));
      return { kind: 'cleared' };
    }
    const [row] = await tx
      .insert(guestLogs)
      .values({ guestId, invitationId, souvenirAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: guestLogs.guestId, set: { souvenirAt: sql`coalesce(${guestLogs.souvenirAt}, excluded.souvenir_at)`, updatedAt: now } })
      .returning({ souvenirAt: guestLogs.souvenirAt });
    const at = row?.souvenirAt ?? now;
    return { kind: 'given', at, first: at.getTime() === now.getTime() };
  });
}

export type GiftInput = { guestId: number | null; giverName: string | null; kind: GiftKind; amount: number | null; note: string | null; side: FamilySide | null };
export type GiftOutcome = { kind: 'recorded' } | { kind: 'replayed' } | { kind: 'key-reused' } | { kind: 'full' } | { kind: 'notfound' } | { kind: 'giver' } | { kind: 'side' };

/**
 * Records one gift. The form's request key makes a double tap or a resend record one entry ("replayed"); the same key
 * with different content, its family side included, is refused ("key-reused"). A listed guest's name is the giver unless
 * the owner typed one. A family side is refused on an invitation that is not a wedding (I-04, D-059).
 */
export async function recordGift(ownerId: number, invitationId: number, input: GiftInput & { requestKey: string }, now: Date = new Date()): Promise<GiftOutcome> {
  return db.transaction(async (tx) => {
    const owned = await lockOwned(tx, ownerId, invitationId);
    if (!owned) return { kind: 'notfound' };
    if (input.side !== null && !familySidesApply(owned.eventType)) return { kind: 'side' };
    const guest = input.guestId === null ? null : await guestOf(tx, invitationId, input.guestId);
    if (input.guestId !== null && !guest) return { kind: 'notfound' };
    const giverName = input.giverName ?? guest?.name ?? null;
    if (!giverName) return { kind: 'giver' };
    const content = { guestId: input.guestId, giverName, kind: input.kind, amount: input.amount, note: input.note, side: input.side };
    const [prior] = await tx
      .select({ guestId: giftLogs.guestId, giverName: giftLogs.giverName, kind: giftLogs.kind, amount: giftLogs.amount, note: giftLogs.note, side: giftLogs.familySide })
      .from(giftLogs)
      .where(and(eq(giftLogs.invitationId, invitationId), eq(giftLogs.requestKey, input.requestKey)));
    if (prior) return JSON.stringify(prior) === JSON.stringify(content) ? { kind: 'replayed' } : { kind: 'key-reused' };
    const [{ n }] = await tx.select({ n: count() }).from(giftLogs).where(eq(giftLogs.invitationId, invitationId));
    if (n >= MAX_GIFTS) return { kind: 'full' };
    const { side, ...rest } = content;
    await tx.insert(giftLogs).values({ invitationId, ...rest, familySide: side, requestKey: input.requestKey, receivedAt: now, createdAt: now, updatedAt: now });
    return { kind: 'recorded' };
  });
}

/**
 * Corrects an entry's giver, kind, amount, note or family side; the guest link and the time stay as recorded. `side`
 * undefined keeps the stored side (a form without the field, as on an invitation that is not a wedding), null clears it.
 */
export async function updateGift(
  ownerId: number,
  invitationId: number,
  giftId: number,
  input: { giverName: string; kind: GiftKind; amount: number | null; note: string | null; side?: FamilySide | null },
  now: Date = new Date(),
): Promise<'saved' | 'notfound' | 'side'> {
  return db.transaction(async (tx) => {
    const owned = await lockOwned(tx, ownerId, invitationId);
    if (!owned) return 'notfound';
    const { side, ...fields } = input;
    if (side !== undefined && side !== null && !familySidesApply(owned.eventType)) return 'side';
    const changed = await tx
      .update(giftLogs)
      .set({ ...fields, ...(side === undefined ? {} : { familySide: side }), updatedAt: now })
      .where(and(eq(giftLogs.id, giftId), eq(giftLogs.invitationId, invitationId)))
      .returning({ id: giftLogs.id });
    return changed.length ? 'saved' : 'notfound';
  });
}

export async function deleteGift(ownerId: number, invitationId: number, giftId: number): Promise<'deleted' | 'notfound'> {
  return db.transaction(async (tx) => {
    if (!(await lockOwned(tx, ownerId, invitationId))) return 'notfound';
    const removed = await tx
      .delete(giftLogs)
      .where(and(eq(giftLogs.id, giftId), eq(giftLogs.invitationId, invitationId)))
      .returning({ id: giftLogs.id });
    return removed.length ? 'deleted' : 'notfound';
  });
}
