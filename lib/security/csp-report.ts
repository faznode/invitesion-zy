/**
 * B-038: what a CSP violation report may leave in the logs. A report carries the page's address (an invitation's slug
 * and a guest's, UU PDP), the blocked address, the policy and sometimes a sample of the offending code. Only the
 * directive, the blocked origin or keyword, the route's shape, the disposition and a Next chunk's position survive; the
 * report-only period is reviewed from these lines.
 */

export type CspViolation = {
  directive: string;
  blocked: string;
  route: string;
  disposition: 'enforce' | 'report' | 'unknown';
  source?: string;
  line?: number;
  column?: number;
};

export const MAX_REPORT_BYTES = 16 * 1024;
const MAX_VIOLATIONS_PER_REQUEST = 20;
const MAX_SEGMENTS = 8;

/** The values a browser writes instead of an address. */
const BLOCKED_KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'self', 'data', 'blob', 'trusted-types-policy', 'trusted-types-sink']);

/**
 * Fixed segment names of the app's routes. Any other segment (a slug, an id, a token) becomes `*`; so do the two
 * positions that are always private: the invitation and guest under `/i/`, and the admin entry under `/admin/`.
 */
const FIXED_SEGMENTS = new Set([
  'activity', 'admin', 'analytics', 'api', 'book', 'buat', 'checkin', 'checkins', 'checkout', 'customers', 'daftar',
  'dashboard', 'detail', 'edit', 'event-blueprint', 'event-types', 'export', 'features', 'gabung', 'general', 'guests',
  'import', 'insights', 'invitations', 'login', 'logs', 'manage', 'media', 'orders', 'payments', 'planner', 'preview',
  'pratinjau', 'pricing', 'profile', 'resources', 'security', 'sign-in', 'sign-up', 'simpan', 'team', 'templates',
  'terima', 'upload', 'use', 'user', 'webhook', 'wishes',
]);
const GUEST_PAGE_SEGMENTS = new Set(['pass', 'gift', 'qris', 'photo']);

// A page address without its private parts:
//   /i/budi-sari/budi-hartono?x=1      → /i/*/*
//   /dashboard/invitations/42/checkin  → /dashboard/invitations/*/checkin
export function routeShape(address: unknown): string {
  const pathname = pathnameOf(address);
  if (pathname === null) return 'unknown';
  const segments = pathname.split('/').filter(Boolean).slice(0, MAX_SEGMENTS);
  if (segments.length === 0) return '/';
  const area = segments[0].toLowerCase();
  const shaped = segments.map((segment, index) => {
    const word = segment.toLowerCase();
    if (area === 'i' && index > 0) return index > 2 && GUEST_PAGE_SEGMENTS.has(word) ? word : '*';
    if (area === 'admin' && index === 1) return '*';
    return index === 0 && word === 'i' ? 'i' : FIXED_SEGMENTS.has(word) ? word : '*';
  });
  return `/${shaped.join('/')}`;
}

function pathnameOf(address: unknown): string | null {
  if (typeof address !== 'string' || address === '') return null;
  try {
    return new URL(address, 'https://report.invalid').pathname;
  } catch {
    return null;
  }
}

function originOf(address: string): string | null {
  try {
    return new URL(address).origin;
  } catch {
    return null;
  }
}

/** An address shrinks to its origin, or its scheme when it has none (`data`, `blob`, an extension's). */
export function blockedOf(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return 'unknown';
  const raw = value.trim();
  if (BLOCKED_KEYWORDS.has(raw)) return raw;
  try {
    const url = new URL(raw);
    if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return url.origin;
    return url.protocol.slice(0, -1).slice(0, 32);
  } catch {
    return 'other';
  }
}

/** A Next chunk keeps its path (a build artifact) so the violation can be found; anything else, the page included, its origin. */
function sourceOf(value: unknown, documentOrigin: string | null): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  try {
    const url = new URL(value);
    if (url.origin === documentOrigin && url.pathname.startsWith('/_next/static/')) return url.pathname.slice(0, 160);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : url.protocol.slice(0, -1).slice(0, 32);
  } catch {
    return BLOCKED_KEYWORDS.has(value) ? value : undefined;
  }
}

function directiveOf(effective: unknown, violated: unknown): string {
  const candidate = typeof effective === 'string' && effective ? effective : typeof violated === 'string' ? violated.split(' ')[0] : '';
  return /^[a-z][a-z-]{1,40}$/.test(candidate) ? candidate : 'unknown';
}

function position(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000_000 ? value : undefined;
}

function dispositionOf(value: unknown): CspViolation['disposition'] {
  return value === 'enforce' || value === 'report' ? value : 'unknown';
}

type Fields = Record<string, unknown>;

/** One report in either format, reduced to the fields above. */
function violationFrom(fields: Fields, legacy: boolean): CspViolation {
  const documentAddress = legacy ? fields['document-uri'] : fields.documentURL;
  const documentOrigin = typeof documentAddress === 'string' ? originOf(documentAddress) : null;
  const violation: CspViolation = {
    directive: directiveOf(legacy ? fields['effective-directive'] : fields.effectiveDirective, legacy ? fields['violated-directive'] : undefined),
    blocked: blockedOf(legacy ? fields['blocked-uri'] : fields.blockedURL),
    route: routeShape(documentAddress),
    disposition: dispositionOf(fields.disposition),
  };
  const source = sourceOf(legacy ? fields['source-file'] : fields.sourceFile, documentOrigin);
  const line = position(legacy ? fields['line-number'] : fields.lineNumber);
  const column = position(legacy ? fields['column-number'] : fields.columnNumber);
  if (source !== undefined) violation.source = source;
  if (line !== undefined) violation.line = line;
  if (column !== undefined) violation.column = column;
  return violation;
}

const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `application/csp-report` (`report-uri`: one `{"csp-report": {…}}`) or `application/reports+json` (`report-to`: an
 * array of reports, of which only `csp-violation` ones count). Malformed input yields nothing; at most 20 distinct
 * violations per request.
 */
export function parseCspReports(text: string): CspViolation[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return [];
  }
  const violations: CspViolation[] = [];
  if (isObject(payload) && isObject(payload['csp-report'])) {
    violations.push(violationFrom(payload['csp-report'], true));
  } else if (Array.isArray(payload)) {
    for (const report of payload.slice(0, 100)) {
      if (isObject(report) && report.type === 'csp-violation' && isObject(report.body)) violations.push(violationFrom(report.body, false));
    }
  }
  const distinct = new Map(violations.map((violation) => [JSON.stringify(violation), violation]));
  return [...distinct.values()].slice(0, MAX_VIOLATIONS_PER_REQUEST);
}

/**
 * The collector is open to anyone, so its logging is bounded per server instance: at most `max` violations per window,
 * the rest counted and reported as one line when the next window opens.
 */
export function createLogBudget(max: number, windowMs: number, now: () => number = Date.now) {
  let windowStart = now();
  let used = 0;
  let dropped = 0;
  return (): { log: boolean; droppedInLastWindow: number } => {
    const time = now();
    let droppedInLastWindow = 0;
    if (time - windowStart >= windowMs) {
      droppedInLastWindow = dropped;
      windowStart = time;
      used = 0;
      dropped = 0;
    }
    if (used < max) {
      used += 1;
      return { log: true, droppedInLastWindow };
    }
    dropped += 1;
    return { log: false, droppedInLastWindow };
  };
}
