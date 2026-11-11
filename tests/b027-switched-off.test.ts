// B-027 (s17, E-020 limit): a stale form posted after the host switched its section off is refused with `?rsvp=closed`
// or `?wish=closed`. The section is no longer rendered, so the refusal is announced right after the cover instead, once,
// in every layout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, formCount, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const RSVP_REFUSED = 'Konfirmasimu belum tersimpan karena RSVP untuk undangan ini sudah ditutup.';
const WISH_REFUSED = 'Ucapanmu belum tersimpan karena buku tamu undangan ini sudah ditutup.';
const config = (rsvp: boolean, guestbook: boolean): DetailConfig => ({
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [{ title: 'Resepsi Contoh', startAt: '2099-03-10T19:00:00+08:00' }],
  rsvp: { enabled: rsvp },
  guestbook: { enabled: guestbook, moderation: false },
});
const count = (html: string, text: string) => html.split(text).length - 1;
const alertBefore = (html: string, text: string, marker: string) => {
  const notice = html.indexOf(text);
  return notice > html.indexOf('</header>') && notice < html.indexOf(marker) && /role="alert"[^>]*>[^<]*$/.test(html.slice(0, notice));
};

test('B-027: a refused RSVP for a switched-off section is announced after the cover in every layout', () => {
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config(false, true), familyId), guest: fixtureGuest(), status: { rsvp: 'closed' } });
    assert.equal(count(page, RSVP_REFUSED), 1, `${label}: announced once`);
    assert.ok(alertBefore(page, RSVP_REFUSED, 'Resepsi Contoh'), `${label}: an alert after the cover, before the programme`);
    assert.ok(!page.includes('Konfirmasi Kehadiran'), `${label}: the RSVP section stays hidden`);
    assert.equal(formCount(page), 1, `${label}: only the guestbook form`);
  }
});

test('B-027: a refused wish for a switched-off guestbook is announced after the cover in every layout', () => {
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config(true, false), familyId), guest: fixtureGuest(), status: { wish: 'closed' } });
    assert.equal(count(page, WISH_REFUSED), 1, `${label}: announced once`);
    assert.ok(alertBefore(page, WISH_REFUSED, 'Resepsi Contoh'), `${label}: an alert after the cover, before the programme`);
    assert.equal(formCount(page), 1, `${label}: only the RSVP form`);
  }
});

test('B-027: a shown section keeps its own notice; nothing is announced twice or without a refusal', () => {
  for (const { label, familyId } of LAYOUTS) {
    const shown = renderGuestPage({ config: withFamily(config(true, true), familyId), guest: fixtureGuest(), status: { rsvp: 'closed', wish: 'closed' } });
    assert.equal(count(shown, RSVP_REFUSED), 1, `${label}: RSVP notice once, inside its section`);
    assert.equal(count(shown, WISH_REFUSED), 1, `${label}: wish notice once, inside its section`);
    assert.ok(shown.indexOf(RSVP_REFUSED) > shown.indexOf('Resepsi Contoh'), `${label}: inside the RSVP section, as before`);

    const quiet = renderGuestPage({ config: withFamily(config(false, false), familyId), guest: fixtureGuest() });
    assert.ok(!quiet.includes('role="alert"'), `${label}: no refusal, no alert`);

    const crafted = renderGuestPage({ config: withFamily(config(false, false), familyId), guest: fixtureGuest(), status: { rsvp: 'saved', wish: 'invalid' } });
    assert.ok(!crafted.includes('role="alert"') && !crafted.includes('role="status"'), `${label}: only a refusal can reach a hidden section`);

    const both = renderGuestPage({ config: withFamily(config(false, false), familyId), guest: fixtureGuest(), status: { rsvp: 'closed', wish: 'closed' } });
    assert.equal(count(both, RSVP_REFUSED) + count(both, WISH_REFUSED), 2, `${label}: both refusals`);
  }
});
