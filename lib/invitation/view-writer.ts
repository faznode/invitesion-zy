import 'server-only';

import { apiConfigFromEnv, apiPost } from '@/lib/api/client';
import { backendFor } from '@/lib/backend';
import { db } from '@/lib/db/drizzle';
import { recordInvitationView } from './view-tracking';

/**
 * R-02: records one open through exactly one writer, chosen per call by `BACKEND_VIEWS` (`next` default, `rust`).
 * Both writers hold the same contract (`contracts/vectors/view-dedupe.json`), take the same advisory lock and write
 * the same columns, so flipping the variable is the rollback. There is deliberately no fallback: a failed API call
 * loses one open instead of risking a second writer. Errors propagate; `trackInvitationView()` keeps tracking
 * best-effort, so an API failure never fails the guest page.
 */
export async function writeInvitationView(
  invitationId: number,
  guestId?: number | null,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (backendFor('VIEWS', env) === 'rust') {
    const body = guestId ? { invitationId, guestId } : { invitationId };
    const { recorded } = await apiPost(apiConfigFromEnv(env), '/v1/views', body);
    return recorded;
  }
  return recordInvitationView(db, invitationId, guestId);
}
