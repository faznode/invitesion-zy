// B-035: the editor's save loop (`lib/invitation/autosave.ts`) on a fake clock with answers the test releases by hand:
// debounced saves carrying the version they were based on, one save in flight, edits made during a save kept and sent
// next (a late answer never discards them), failures retried with a growing delay, refusals not retried with the same
// content, a conflict that stops saving until the host chooses, and manual mode. Plus the API answer mapping.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTOSAVE_DEBOUNCE_MS, AutosaveController, retryDelayMs, saveResultOf, type SaveRequest, type SaveResult } from '../lib/invitation/autosave';

type Config = { text: string };

function harness({ auto = true, baseVersion = 3 } = {}) {
  let now = 1_000;
  let nextHandle = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const sends: { request: SaveRequest<Config>; answer: (result: SaveResult) => Promise<void> }[] = [];
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  const controller = new AutosaveController<Config>({
    baseVersion,
    config: { text: 'awal' },
    auto,
    now: () => now,
    schedule: (run, ms) => {
      nextHandle += 1;
      timers.set(nextHandle, { at: now + ms, run });
      return nextHandle;
    },
    cancel: (handle) => void timers.delete(handle as number),
    send: (request) =>
      new Promise<SaveResult>((resolve) => {
        sends.push({ request, answer: async (result) => { resolve(result); await settle(); await settle(); } });
      }),
  });
  async function advance(ms: number) {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].run();
      await settle();
    }
    now = until;
  }
  return { controller, sends, advance, edit: (text: string) => controller.edit({ text }), timers };
}

test('a save goes out once, a debounce after the last edit, with the config of that moment and the loaded version', async () => {
  const h = harness();
  h.edit('a');
  await h.advance(300);
  h.edit('ab');
  await h.advance(AUTOSAVE_DEBOUNCE_MS - 1);
  assert.equal(h.sends.length, 0, 'still typing');
  assert.equal(h.controller.snapshot().status, 'dirty');
  await h.advance(1);
  assert.equal(h.sends.length, 1);
  assert.deepEqual(h.sends[0].request, { config: { text: 'ab' }, expectedVersion: 3 });
  assert.equal(h.controller.snapshot().status, 'saving');
  await h.sends[0].answer({ kind: 'saved', version: 4 });
  const after = h.controller.snapshot();
  assert.equal(after.status, 'saved');
  assert.equal(after.dirty, false);
  assert.equal(after.baseVersion, 4);
  assert.notEqual(after.savedAt, null);
});

test('the backlog target: the debounce leaves at least a second for the request inside "2 s after idle"', () => {
  assert.ok(AUTOSAVE_DEBOUNCE_MS <= 1000, `${AUTOSAVE_DEBOUNCE_MS} ms`);
});

test('edits made during a save stay unsaved and go out next, based on the version that save wrote', async () => {
  const h = harness();
  h.edit('pertama');
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  h.edit('pertama dan kedua');
  await h.advance(AUTOSAVE_DEBOUNCE_MS * 3);
  assert.equal(h.sends.length, 1, 'only one save in flight');
  await h.sends[0].answer({ kind: 'saved', version: 4 });
  assert.equal(h.controller.snapshot().status, 'dirty', 'the late answer does not mark the newer edit saved');
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.sends[1].request, { config: { text: 'pertama dan kedua' }, expectedVersion: 4 });
  await h.sends[1].answer({ kind: 'saved', version: 5 });
  assert.equal(h.controller.snapshot().status, 'saved');
});

test('a transport failure keeps the edits and retries the same content with a growing delay', async () => {
  const h = harness();
  h.edit('isi');
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  await h.sends[0].answer({ kind: 'retry', reason: 'network' });
  let snapshot = h.controller.snapshot();
  assert.equal(snapshot.status, 'failed');
  assert.equal(snapshot.problem?.kind, 'retry');
  assert.equal(snapshot.dirty, true);
  await h.advance(retryDelayMs(1) - 1);
  assert.equal(h.sends.length, 1);
  await h.advance(1);
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.sends[1].request, h.sends[0].request);
  await h.sends[1].answer({ kind: 'retry', reason: 'unconfirmed' });
  await h.advance(retryDelayMs(2) - 1);
  assert.equal(h.sends.length, 2, 'the second retry waits longer');
  await h.advance(1);
  await h.sends[2].answer({ kind: 'saved', version: 4 });
  snapshot = h.controller.snapshot();
  assert.equal(snapshot.status, 'saved');
  assert.equal(snapshot.problem, null);
  assert.deepEqual([1, 2, 3, 4, 9].map(retryDelayMs), [2000, 4000, 8000, 15000, 15000]);
});

test('a refusal is not retried with the same content; the next edit tries again', async () => {
  const h = harness();
  h.edit('tidak valid');
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  await h.sends[0].answer({ kind: 'refused', reason: 'invalid' });
  assert.equal(h.controller.snapshot().status, 'failed');
  await h.advance(60_000);
  assert.equal(h.sends.length, 1, 'no retry of the refused content');
  h.edit('valid');
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.sends[1].request.config, { text: 'valid' });
});

test('edits made while a refused save was in flight get their own attempt', async () => {
  const h = harness();
  h.edit('salah');
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  h.edit('benar');
  await h.sends[0].answer({ kind: 'refused', reason: 'media' });
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.sends[1].request.config, { text: 'benar' });
});

test('a conflict stops every save until the host chooses; keeping this tab rebases on the stored version', async () => {
  const h = harness();
  h.edit('tab ini');
  await h.advance(AUTOSAVE_DEBOUNCE_MS);
  await h.sends[0].answer({ kind: 'conflict', currentVersion: 7 });
  assert.equal(h.controller.snapshot().status, 'conflict');
  assert.equal(h.controller.snapshot().conflictVersion, 7);
  h.edit('tab ini lagi');
  h.controller.flush();
  await h.advance(60_000);
  assert.equal(h.sends.length, 1, 'nothing is sent while in conflict, not even by the button');
  h.controller.overwrite();
  await h.advance(0);
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.sends[1].request, { config: { text: 'tab ini lagi' }, expectedVersion: 7 });
  await h.sends[1].answer({ kind: 'saved', version: 8 });
  assert.equal(h.controller.snapshot().status, 'saved');
  assert.equal(h.controller.snapshot().conflictVersion, null);
});

test('manual mode saves only on the button; a click during a save sends the newer edits right after it', async () => {
  const h = harness({ auto: false });
  h.edit('manual');
  await h.advance(60_000);
  assert.equal(h.sends.length, 0);
  h.controller.flush();
  assert.equal(h.sends.length, 1);
  h.edit('manual 2');
  h.controller.flush();
  assert.equal(h.sends.length, 1, 'one save in flight');
  await h.sends[0].answer({ kind: 'saved', version: 4 });
  assert.equal(h.sends.length, 2, 'the queued click goes out at once');
  assert.deepEqual(h.sends[1].request, { config: { text: 'manual 2' }, expectedVersion: 4 });
  await h.sends[1].answer({ kind: 'retry', reason: 'server' });
  await h.advance(60_000);
  assert.equal(h.sends.length, 2, 'manual mode does not retry by itself');
});

test('nothing to save sends nothing, a throwing send is a transport failure, and a disposed loop stops', async () => {
  const h = harness();
  h.controller.flush();
  assert.equal(h.sends.length, 0);
  const failing = new AutosaveController<Config>({
    baseVersion: 1,
    config: { text: '' },
    auto: false,
    send: async () => {
      throw new TypeError('fetch failed');
    },
  });
  failing.edit({ text: 'x' });
  failing.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(failing.snapshot().problem?.kind, 'retry');
  h.edit('lalu ditutup');
  h.controller.dispose();
  await h.advance(60_000);
  assert.equal(h.sends.length, 0);
});

test("the detail API's answers map to the loop's results", () => {
  const cases: [number, unknown, SaveResult][] = [
    [200, { data: {}, version: 12 }, { kind: 'saved', version: 12 }],
    [200, { data: {} }, { kind: 'retry', reason: 'server' }],
    [409, { error: { code: 'VERSION_CONFLICT', details: { currentVersion: 13 } } }, { kind: 'conflict', currentVersion: 13 }],
    [400, { error: { code: 'INVALID_MEDIA' } }, { kind: 'refused', reason: 'media' }],
    [403, { error: { code: 'THEME_NOT_ENTITLED' } }, { kind: 'refused', reason: 'theme' }],
    [401, { error: { code: 'UNAUTHENTICATED' } }, { kind: 'refused', reason: 'signin' }],
    [404, { error: { code: 'NOT_FOUND' } }, { kind: 'refused', reason: 'notfound' }],
    [422, { error: { code: 'VALIDATION_ERROR' } }, { kind: 'refused', reason: 'invalid' }],
    [400, { error: { code: 'BAD_REQUEST' } }, { kind: 'refused', reason: 'invalid' }],
    [503, { error: { code: 'SAVE_UNCONFIRMED' } }, { kind: 'retry', reason: 'unconfirmed' }],
    [500, null, { kind: 'retry', reason: 'server' }],
    [502, '<html>proxy</html>', { kind: 'retry', reason: 'server' }],
  ];
  for (const [status, body, expected] of cases) assert.deepEqual(saveResultOf(status, body), expected, `${status} ${JSON.stringify(body)}`);
});
