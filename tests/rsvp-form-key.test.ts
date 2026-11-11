// R-03 (D-043): the key one rendered RSVP form carries, and the key a retry notice carries back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RSVP_KEY_PATTERN, isRsvpFormKey, rsvpFormKey } from '../lib/invitation/rsvp-form-key';

test('a form key is 16–64 letters, digits or dashes; anything else is ignored', () => {
  assert.ok(isRsvpFormKey('0123456789abcdef'));
  assert.ok(isRsvpFormKey(crypto.randomUUID()));
  for (const odd of ['', 'short', 'x'.repeat(65), 'has space 0123456789', 'k'.repeat(15), 'a/b-0123456789abcdef', null, undefined, 42]) {
    assert.equal(isRsvpFormKey(odd), false, String(odd));
  }
  assert.equal(RSVP_KEY_PATTERN.source, '^[A-Za-z0-9-]{16,64}$');
});

test('the page reuses a carried key only when it is a valid key, and mints a fresh one otherwise', () => {
  const carried = '6f1c2b3a-0d4e-4f5a-8b9c-0123456789ab';
  assert.equal(rsvpFormKey(carried), carried);
  const fresh = rsvpFormKey(undefined);
  assert.ok(isRsvpFormKey(fresh));
  assert.notEqual(rsvpFormKey(undefined), fresh, 'every rendering gets its own key');
  assert.notEqual(rsvpFormKey('<script>'), '<script>');
});
