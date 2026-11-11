import { randomUUID } from 'node:crypto';

/**
 * R-03: the idempotency key of one rendered RSVP form. The personal guest page mints it, the form sends it back, and the
 * Rust writer passes it as `Idempotency-Key`, so a double submit of one form writes once.
 */
export const RSVP_KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export const isRsvpFormKey = (value: unknown): value is string => typeof value === 'string' && RSVP_KEY_PATTERN.test(value);

/**
 * The key for the form being rendered: the one an "unconfirmed" notice carried back (`?rsvp=retry&rsvpk=`), so the
 * guest's second send of an answer whose first send may have been saved writes at most once; otherwise a fresh key.
 */
export function rsvpFormKey(carried?: string): string {
  return isRsvpFormKey(carried) ? carried : randomUUID();
}

/** R-04: the wish form follows the same pattern with its own key (`?wish=retry&wishk=`); the scopes never overlap. */
export const isFormKey = isRsvpFormKey;
export const formKey = rsvpFormKey;
