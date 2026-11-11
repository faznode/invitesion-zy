import { createLogBudget, MAX_REPORT_BYTES, parseCspReports } from '@/lib/security/csp-report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCEPTED_TYPES = new Set(['application/csp-report', 'application/reports+json', 'application/json']);
const NO_STORE = { 'Cache-Control': 'no-store' };
const budget = createLogBudget(200, 60_000);

/** The body as text, or null once it passes `limit` bytes (a missing or false Content-Length does not get around it). */
async function readAtMost(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * B-038: browsers post CSP violations here (`report-uri` and `report-to` in `lib/security/csp.ts`). Each is logged as one
 * `[csp-report]` line holding only what `parseCspReports` keeps, never stored; the answer is the same for any
 * well-formed post, so the endpoint tells a caller nothing.
 */
export async function POST(request: Request) {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ACCEPTED_TYPES.has(type)) return new Response(null, { status: 415, headers: NO_STORE });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_REPORT_BYTES) return new Response(null, { status: 413, headers: NO_STORE });
  const text = await readAtMost(request, MAX_REPORT_BYTES);
  if (text === null) return new Response(null, { status: 413, headers: NO_STORE });
  for (const violation of parseCspReports(text)) {
    const { log, droppedInLastWindow } = budget();
    if (droppedInLastWindow > 0) console.warn(`[csp-report] ${droppedInLastWindow} report(s) over the logging budget were not logged`);
    if (log) console.warn(`[csp-report] ${JSON.stringify(violation)}`);
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}
