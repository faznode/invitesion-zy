/**
 * B-027 slice 2c (D-036): durable event ids. Per-event answers name an event by its id, so an event keeps the same id
 * through edits, reordering and other events being added or deleted. Array position is never an identity (D-034); it is
 * used exactly once, to mint the id of an event stored before ids existed, and the id then travels with the event.
 *
 * Client-safe on purpose (no zod, no server imports): the editor mints ids for the events a host adds.
 */

export const EVENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const LEGACY_ID = /^ev-([1-9]\d{0,2})$/;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

type Item = Record<string, unknown>;

const isItem = (value: unknown): value is Item => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const usableId = (value: unknown): value is string => typeof value === 'string' && EVENT_ID_PATTERN.test(value);

/**
 * A fresh id for an event a host adds: `ev-` plus a letter and nine base-36 characters. It can never equal a legacy
 * `ev-<position>` id, so a new event never inherits the answers stored for a deleted legacy event.
 */
export function newEventId(fill: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  const bytes = fill(new Uint8Array(10));
  let id = ID_ALPHABET[bytes[0] % 26];
  for (let index = 1; index < 10; index += 1) id += ID_ALPHABET[bytes[index] % 36];
  return `ev-${id}`;
}

/** The 1-based position a legacy id was minted from (`ev-3` → 3), or null for any other id. */
export function legacyEventPosition(id: string | undefined): number | null {
  const match = id ? LEGACY_ID.exec(id) : null;
  return match ? Number(match[1]) : null;
}

/** Keep the first holder of each usable id; every other event gets `mint(index, taken)`. */
function assignIds(items: readonly Item[], mint: (index: number, taken: ReadonlySet<string>) => string): Item[] {
  const owners = new Map<string, number>();
  items.forEach((item, index) => {
    if (usableId(item.id) && !owners.has(item.id)) owners.set(item.id, index);
  });
  const taken = new Set(owners.keys());
  return items.map((item, index) => {
    if (usableId(item.id) && owners.get(item.id) === index) return item;
    const id = mint(index, taken);
    taken.add(id);
    return { ...item, id };
  });
}

/**
 * Ids for a stored events array, by the one rule the read path, the write path's carried events and migration 0013 share:
 * an event keeps a usable id unless an earlier event already holds it; any other event gets `ev-<position>` (1-based), or
 * `ev-<position>-<k>` for the smallest free k ≥ 2 when that is taken. Deterministic, so the guest page and the RSVP action
 * derive the same ids from the same stored config even before the backfill ran. Anything that is not an array of objects
 * is returned unchanged for the schema to judge, exactly as before.
 */
export function keyStoredEvents(raw: unknown): unknown {
  if (!Array.isArray(raw) || !raw.every(isItem)) return raw;
  return assignIds(raw, (index, taken) => {
    const base = `ev-${index + 1}`;
    if (!taken.has(base)) return base;
    for (let k = 2; ; k += 1) if (!taken.has(`${base}-${k}`)) return `${base}-${k}`;
  });
}

/**
 * Ids for events a writer sends. An event without a usable id (or repeating an earlier one) is new to this config, so it
 * gets a fresh random id: a position would let it inherit the stored answers of a deleted event at the same position.
 */
export function keyEventsForWrite<T extends Item>(events: readonly T[], mint: () => string = newEventId): Array<T & { id: string }> {
  return assignIds(events, (_index, taken) => {
    let id = mint();
    while (taken.has(id)) id = mint();
    return id;
  }) as Array<T & { id: string }>;
}

const contentKey = (event: Item) => JSON.stringify([String(event.title ?? '').trim(), String(event.startAt ?? '')]);

/**
 * Contract for restoring a saved version (no restore feature exists yet, D-036). An event that carries an id keeps it, so
 * answers stored for it reattach. An id-less event from a version saved before 0013 takes the id of the live event with
 * the same title and start, else a fresh id; never `ev-<position>` of the old version, whose positions may now hold other
 * events. A stale answer may stay unattached; it is never shown under a different event.
 */
export function rekeyRestoredEvents<T extends Item>(restored: readonly T[], live: readonly Item[]): Array<T & { id: string }> {
  const liveIds = new Map<string, string>();
  for (const event of live) if (usableId(event.id) && !liveIds.has(contentKey(event))) liveIds.set(contentKey(event), event.id);
  const used = new Set(restored.flatMap((event) => (usableId(event.id) ? [event.id] : [])));
  const matched = restored.map((event) => {
    if (usableId(event.id)) return event;
    const id = liveIds.get(contentKey(event));
    if (!id || used.has(id)) return event;
    used.add(id);
    return { ...event, id };
  });
  return keyEventsForWrite(matched);
}

/** Events of a normalised config with their id in the type. The read path keys every event, so none is ever left out. */
export function eventsWithIds<T extends { id?: string }>(events: readonly T[] | undefined): Array<T & { id: string }> {
  return (events ?? []).filter((event): event is T & { id: string } => typeof event.id === 'string');
}
