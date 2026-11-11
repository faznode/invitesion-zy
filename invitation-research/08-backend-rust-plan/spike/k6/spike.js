// k6 workload for the backend spike (masterplan ch. 09). Same script and profile for every target; only the
// target's routes differ.
//
//   k6 run -e TARGET=next|next-min|rust -e BASE=http://127.0.0.1:3100 -e SCENARIO=read-spike|rsvp-burst|fixed-read spike.js
//
// Targets:
//   next      the product as shipped: full guest page (React SSR) + no-JS server-action RSVP form POST
//   next-min  same Next server, spike route handlers: one loadPublicInvitation() + minimal HTML, form-route RSVP
//   rust      Axum spike: same queries + minimal HTML, form-route RSVP
// Scenarios (documented in ../README.md):
//   read-spike  WhatsApp-blast shape: 0 -> 40 VUs in 10 s, 40 VUs for 40 s, -> 0 in 10 s; GET a random guest page, no think time
//   rsvp-burst  write burst: 0 -> 20 VUs in 5 s, 20 VUs for 30 s, -> 0 in 5 s; POST RSVP CONFIRMED (1 person) for a random guest
//   fixed-read  equal load: 10 requests/s for 30 s (open model), to compare latency at a rate every target sustains
// Fake data only: guests tamu-001 ... tamu-300 on the fixture invitation (seed-spike-guests.sql).
//
// Validity (session 09): every measured request and check carries tag op=read|rsvp; the one setup GET is op=setup and is
// excluded from the measured numbers. A run is valid only if >= 99 % of measured checks pass and < 1 % of measured
// requests fail; otherwise k6 exits 99 and run-spike.sh records the scenario as FAILED.
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';

const TARGET = __ENV.TARGET || 'next';
const DEFAULT_BASE = TARGET === 'rust' ? 'http://127.0.0.1:3200' : 'http://127.0.0.1:3100';
const BASE = __ENV.BASE || DEFAULT_BASE;
const PREFIX = TARGET === 'next-min' ? '/spike-min' : '';
const SLUG = __ENV.SLUG || 'budi-sari';
const GUESTS = Number(__ENV.GUESTS || 300);
const SCENARIO = __ENV.SCENARIO || 'read-spike';
const OP = SCENARIO === 'rsvp-burst' ? 'rsvp' : 'read';

const rsvpSaved = new Counter('rsvp_saved');
const readsOk = new Counter('reads_ok');

const scenarios = {
  'read-spike': {
    executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '5s', exec: 'readPage',
    stages: [{ duration: '10s', target: 40 }, { duration: '40s', target: 40 }, { duration: '10s', target: 0 }],
  },
  'rsvp-burst': {
    executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '5s', exec: 'submitRsvp',
    stages: [{ duration: '5s', target: 20 }, { duration: '30s', target: 20 }, { duration: '5s', target: 0 }],
  },
  'fixed-read': {
    executor: 'constant-arrival-rate', rate: 10, timeUnit: '1s', duration: '30s', preAllocatedVUs: 20, maxVUs: 60, exec: 'readPage',
  },
};

export const options = {
  scenarios: { [SCENARIO]: scenarios[SCENARIO] },
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    [`checks{op:${OP}}`]: ['rate>=0.99'],
    [`http_req_failed{op:${OP}}`]: ['rate<0.01'],
    // Always-true thresholds whose only job is to make k6 export the op-tagged sub-metrics.
    [`http_reqs{op:${OP}}`]: ['count>=0'],
    [`http_req_duration{op:${OP}}`]: ['max>=0'],
    [`http_req_waiting{op:${OP}}`]: ['max>=0'],
    [`http_req_receiving{op:${OP}}`]: ['max>=0'],
    [`data_received{op:${OP}}`]: ['count>=0'],
  },
};

function guestSlug() {
  const n = 1 + Math.floor(Math.random() * GUESTS);
  return `tamu-${String(n).padStart(3, '0')}`;
}

function pagePath(guest) {
  return `${BASE}${PREFIX}/i/${SLUG}/${guest}`;
}

export function setup() {
  if (TARGET !== 'next' || SCENARIO !== 'rsvp-burst') return {};
  // The no-JS server-action form carries the action id as a hidden field name; the RSVP form comes first.
  const page = http.get(pagePath('tamu-001'), { tags: { op: 'setup' } });
  const ids = [...String(page.body).matchAll(/name="(\$ACTION_ID_[0-9a-f]+)"/g)].map((m) => m[1]);
  if (!ids.length) fail('no server-action id found on the guest page');
  return { actionField: ids[0] };
}

export function readPage() {
  const res = http.get(pagePath(guestSlug()), { tags: { op: 'read' } });
  const ok = check(
    res,
    { 'status 200': (r) => r.status === 200, 'guest greeting rendered': (r) => Boolean(r.body) && String(r.body).includes('Kepada') },
    { op: 'read' },
  );
  if (ok) readsOk.add(1);
}

function multipart(fields) {
  const boundary = '----k6spike' + Math.random().toString(16).slice(2);
  let body = '';
  for (const [name, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  return { body: body + `--${boundary}--\r\n`, type: `multipart/form-data; boundary=${boundary}` };
}

export function submitRsvp(data) {
  const guest = guestSlug();
  let res;
  if (TARGET === 'next') {
    const form = multipart({ [data.actionField]: '', slug: SLUG, guestSlug: guest, guestCount: '1', status: 'CONFIRMED' });
    res = http.post(pagePath(guest), form.body, { headers: { 'Content-Type': form.type }, redirects: 0, tags: { op: 'rsvp' } });
  } else {
    res = http.post(`${pagePath(guest)}/rsvp`, { guestCount: '1', status: 'CONFIRMED' }, { redirects: 0, tags: { op: 'rsvp' } });
  }
  const ok = check(
    res,
    {
      'status 303': (r) => r.status === 303,
      'redirect says saved': (r) => String(r.headers.Location || r.headers.location || '').includes('rsvp=saved'),
    },
    { op: 'rsvp' },
  );
  if (ok) rsvpSaved.add(1);
}
