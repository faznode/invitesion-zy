/**
 * B-024 (I-27, D-056): the scanner's outbox, without React. Scans wait here until the check-in route confirms them, so a
 * weak signal or a reload loses no arrival. The scanner keeps it in the device's local storage under one key per
 * invitation; it holds pass tokens and scan times only, never a guest's name, and is emptied as batches are confirmed.
 *
 * A batch, once formed, is resent unchanged under the same key until the route answers, and either writer replays the
 * first answer recorded under that key: a lost answer never checks in twice and never turns a first arrival amber.
 */

export type QueuedScan = { id: string; token: string; scannedAt: string };
export type QueueState = { scans: QueuedScan[]; batch: { key: string; ids: string[] } | null };

export const EMPTY_QUEUE: QueueState = { scans: [], batch: null };
export const BATCH_SIZE = 50;
export const QUEUE_LIMIT = 2_000;
const STORAGE_PREFIX = 'invitesion.checkin.v1.';

export const queueStorageKey = (invitationId: number) => `${STORAGE_PREFIX}${invitationId}`;

/** Adds a scan unless the same token already waits (a pass shown twice before the signal returns is one arrival). */
export function enqueue(state: QueueState, scan: QueuedScan): QueueState {
  if (state.scans.some((queued) => queued.token === scan.token) || state.scans.length >= QUEUE_LIMIT) return state;
  return { ...state, scans: [...state.scans, scan] };
}

/** The batch to send: the one already in flight (same key, same scans), else the oldest waiting scans under a new key. */
export function nextBatch(state: QueueState, mintKey: () => string): { state: QueueState; key: string; scans: QueuedScan[] } | null {
  if (state.batch) {
    const ids = new Set(state.batch.ids);
    const scans = state.scans.filter((scan) => ids.has(scan.id));
    if (scans.length) return { state, key: state.batch.key, scans };
  }
  const scans = state.scans.slice(0, BATCH_SIZE);
  if (!scans.length) return null;
  const key = mintKey();
  return { state: { ...state, batch: { key, ids: scans.map((scan) => scan.id) } }, key, scans };
}

/** The route answered for this batch (confirmed, or refused for good): its scans leave the queue. */
export function settle(state: QueueState, key: string): QueueState {
  if (!state.batch || state.batch.key !== key) return state;
  const ids = new Set(state.batch.ids);
  return { scans: state.scans.filter((scan) => !ids.has(scan.id)), batch: null };
}

const isScan = (value: unknown): value is QueuedScan =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as QueuedScan).id === 'string' &&
  typeof (value as QueuedScan).token === 'string' &&
  (value as QueuedScan).token.length <= 200 &&
  typeof (value as QueuedScan).scannedAt === 'string';

/**
 * Reads what the device stored, dropping anything malformed; an unreadable value is an empty queue. A batch in flight is
 * kept only when all its scans survived, because a resend must be the same batch: a key with other scans is refused.
 */
export function parseStoredQueue(raw: string | null): QueueState {
  if (!raw) return EMPTY_QUEUE;
  try {
    const value = JSON.parse(raw) as Partial<QueueState>;
    const scans = Array.isArray(value.scans) ? value.scans.filter(isScan).slice(0, QUEUE_LIMIT) : [];
    const batch =
      value.batch && typeof value.batch.key === 'string' && Array.isArray(value.batch.ids)
        ? { key: value.batch.key, ids: value.batch.ids.filter((id): id is string => typeof id === 'string') }
        : null;
    const kept = batch && batch.ids.length > 0 && batch.ids.every((id) => scans.some((scan) => scan.id === id));
    return { scans, batch: kept ? batch : null };
  } catch {
    return EMPTY_QUEUE;
  }
}
