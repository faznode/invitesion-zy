import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { analyticsEvents, guests, invitations, type Guest } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import type { IndonesianZone } from '@/lib/invitation/event-time';
import {
  analyticsTotals,
  followUpLists,
  groupBreakdown,
  hostTimeZone,
  localDate,
  opensByDay,
  OPENS_WINDOW_DAYS,
  shiftDate,
  type AnalyticsTotals,
  type DailyOpens,
  type FollowUpKind,
  type GroupRow,
} from '@/lib/invitation/host-analytics';
import { eventRsvpSummary, exportedEvents, type EventRsvpSummary } from '@/lib/invitation/rsvp-events';

export type HostAnalytics = {
  invitation: { id: number; slug: string; title: string };
  zone: IndonesianZone;
  /** The host's local date (`YYYY-MM-DD`) at `now`. */
  today: string;
  totals: AnalyticsTotals;
  groups: GroupRow[];
  events: EventRsvpSummary[];
  /** The last `days` local days of counted opens, oldest first. */
  daily: DailyOpens[];
  /** Distinct guests whose personal link counted an open today. */
  openedToday: number;
  /** Every counted VIEW of this invitation, and how many came through a personal link. */
  views: { opens: number; guestOpens: number; anonymousOpens: number };
  lists: Record<FollowUpKind, Guest[]>;
  whatsappTemplate: string | null;
};

/**
 * B-034: one invitation's analytics for its owner, or null when the invitation does not exist or belongs to someone
 * else (the caller answers 404, as every owner page does). Ownership is part of the invitation query itself, and every
 * later query is keyed by that invitation's id, so no row of another host's invitation can be read.
 *
 * Counts come straight from the rows: guests from `guests`, opens from the deduplicated VIEW events (B-017a, the same
 * table and window for the TypeScript and the Rust writer). Days are local to `hostTimeZone` (the stored timestamps are
 * UTC wall time). Read-only.
 */
export async function loadHostAnalytics(
  database: PostgresJsDatabase<typeof schema>,
  owner: { userId: number; invitationId: number },
  options: { now?: Date; days?: number } = {},
): Promise<HostAnalytics | null> {
  if (!Number.isInteger(owner.invitationId) || !Number.isInteger(owner.userId)) return null;
  const [invitation] = await database
    .select({ id: invitations.id, slug: invitations.slug, config: invitations.config })
    .from(invitations)
    .where(and(eq(invitations.id, owner.invitationId), eq(invitations.userId, owner.userId), isNull(invitations.deletedAt)))
    .limit(1);
  if (!invitation) return null;

  const { config } = normalizeStoredConfig(invitation.config ?? {});
  const zone = hostTimeZone(config);
  const days = options.days ?? OPENS_WINDOW_DAYS;
  const today = localDate(options.now ?? new Date(), zone);
  const firstDay = shiftDate(today, 1 - days);
  const localDay = sql`((${analyticsEvents.createdAt} at time zone 'UTC') at time zone ${zone})::date`;
  const viewsOfThis = and(eq(analyticsEvents.invitationId, invitation.id), eq(analyticsEvents.eventType, 'VIEW'));

  const [rows, dailyRows, viewRows] = await Promise.all([
    database.select().from(guests).where(eq(guests.invitationId, invitation.id)),
    database
      .select({
        day: sql<string>`to_char(${localDay}, 'YYYY-MM-DD')`,
        opens: sql<number>`count(*)::int`,
        guests: sql<number>`count(distinct ${analyticsEvents.guestId})::int`,
      })
      .from(analyticsEvents)
      .where(and(viewsOfThis, sql`${localDay} between ${firstDay}::date and ${today}::date`))
      .groupBy(sql`1`),
    database
      .select({ opens: sql<number>`count(*)::int`, guestOpens: sql<number>`count(${analyticsEvents.guestId})::int` })
      .from(analyticsEvents)
      .where(viewsOfThis),
  ]);

  const daily = opensByDay(dailyRows, today, days);
  const opens = viewRows[0]?.opens ?? 0;
  const guestOpens = viewRows[0]?.guestOpens ?? 0;
  return {
    invitation: { id: invitation.id, slug: invitation.slug, title: config.settings?.title?.trim() || `/${invitation.slug}` },
    zone,
    today,
    totals: analyticsTotals(rows),
    groups: groupBreakdown(rows),
    events: eventRsvpSummary(rows, exportedEvents(config, rows), isFlagOn('INVITE_ONLY_EVENTS')),
    daily,
    openedToday: daily[daily.length - 1]?.guests ?? 0,
    views: { opens, guestOpens, anonymousOpens: opens - guestOpens },
    lists: followUpLists(rows),
    whatsappTemplate: config.whatsappTemplate ?? null,
  };
}
