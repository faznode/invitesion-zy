// B-009 (D-045): background music and the "Buka Undangan" cover gate on every layout, as the guest receives the page
// (server HTML, before any script). The browser half (no-JS opening, the tap that starts the music, reduced motion, the
// toggle, focus) is `tools/template-harness/cover-gate.ts`. Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { safeAudioSrc } from '../lib/invitation/audio-url';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const SONG = 'https://cdn.example.test/musik/lagu-contoh.mp3';
// A past event: no countdown, so two renders a moment apart are byte-identical.
const base: DetailConfig = {
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  events: [{ title: 'Resepsi', startAt: '2026-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }],
};
const withMusic = (music: DetailConfig['music'], config: DetailConfig = base): DetailConfig => ({ ...config, music });
const audioTags = (html: string) => html.match(/<audio\b[^>]*>/g) ?? [];
const firstAudio = (html: string) => audioTags(html)[0] ?? '';
const mainOf = (html: string) => html.slice(html.indexOf('<main'), html.lastIndexOf('</main>') + '</main>'.length);
const hasGate = (html: string) => /<div[^>]*\bid="sampul"/.test(html);
const hasAttribute = (html: string, name: string) => new RegExp(`<[^>]+\\s${name}(=|\\s|/?>)`).test(html);

test('B-009: safeAudioSrc keeps http(s) URLs only', () => {
  assert.equal(safeAudioSrc(SONG), SONG);
  assert.equal(safeAudioSrc('http://127.0.0.1:3100/review/tone.wav'), 'http://127.0.0.1:3100/review/tone.wav');
  for (const value of [undefined, '', 'javascript:alert(1)', 'data:audio/wav;base64,AAAA', 'blob:https://x.test/1', 'file:///etc/passwd', '/media/1/abc.mp3', 'lagu.mp3']) {
    assert.equal(safeAudioSrc(value), undefined, String(value));
  }
});

test('B-009: with playable music every layout opens behind a labelled cover gate that works before any script', () => {
  for (const { label, familyId } of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(withMusic({ enabled: true, assetUrl: SONG, title: 'Lagu Contoh' }), familyId), guest: fixtureGuest() });
    assert.ok(hasGate(html), `${label}: the gate is in the server HTML`);
    assert.ok(html.indexOf('id="sampul"') < html.indexOf('<main'), `${label}: the gate comes first in reading and tab order`);
    const gate = html.slice(Math.max(0, html.lastIndexOf('<div', html.indexOf('id="sampul"'))), html.indexOf('<main'));
    assert.match(gate, /role="dialog"/);
    assert.match(gate, /aria-modal="true"/);
    assert.match(gate, /aria-labelledby="sampul-judul"/);
    assert.match(gate, /aria-describedby="sampul-tamu"/);
    assert.match(gate, /class="inv-cover-gate /, `${label}: the stylesheet's :target rule applies`);
    // Both links point at the gate itself: a tap makes it :target and the stylesheet hides it, with or without JavaScript.
    assert.match(gate, /<a\b[^>]*href="#sampul"[^>]*>Buka Undangan<\/a>/, `${label}: visible Indonesian label = accessible name`);
    assert.match(gate, /<a\b[^>]*href="#sampul"[^>]*>Buka tanpa musik<\/a>/);
    assert.match(gate, /min-h-12/, `${label}: a 48 px target`);
    assert.match(gate, /Undangan Pernikahan/);
    assert.match(gate, /Kepada Yth\./);
    assert.match(gate, />Budi Hartono</, `${label}: the guest's own name`);
    assert.match(gate, /Sari<\/span>|Sari</);
    // I-15: the exit is the only motion, 0.7 s, and none under reduced motion.
    assert.match(gate, /duration-700/);
    assert.match(gate, /motion-reduce:transition-none/);
    assert.equal(audioTags(html).length, 1, `${label}: one audio element`);
    assert.match(firstAudio(html), /preload="none"/, `${label}: nothing is fetched before the tap`);
    assert.match(firstAudio(html), new RegExp(`src="${SONG.replace(/[.]/g, '\\.')}"`));
    assert.match(firstAudio(html), /\bloop\b/);
    assert.ok(!hasAttribute(html, 'inert'), `${label}: nothing is inert before hydration, so a no-JS guest can use the page`);
    assert.doesNotMatch(html, /aria-pressed/, `${label}: the music control appears only once it can work`);
    assert.doesNotMatch(html, /\sautoplay(=|\s|>)/, `${label}: never the autoplay attribute`);
  }
});

test('B-009: the layout itself is untouched by the island (its `<main>` is byte-identical)', () => {
  for (const { label, familyId } of LAYOUTS) {
    const plain = mainOf(renderGuestPage({ config: withFamily(base, familyId), guest: fixtureGuest() }));
    const music = renderGuestPage({ config: withFamily(withMusic({ enabled: true, assetUrl: SONG }), familyId), guest: fixtureGuest() });
    assert.ok(plain.length > 1000, `${label}: the layout rendered`);
    assert.equal(mainOf(music), plain, `${label}: the layout's markup is unchanged inside the island`);
  }
});

test('B-009: no playable source, the flag off, or no music: every layout renders exactly as before', () => {
  const previous = process.env.FLAG_GUEST_MUSIC;
  try {
    for (const { label, familyId } of LAYOUTS) {
      const plain = renderGuestPage({ config: withFamily(base, familyId), guest: fixtureGuest() });
      // Every wedding preset stores `music: { enabled: true }` without a URL (lib/invitation/templates.ts).
      for (const music of [{ enabled: true }, { enabled: false, assetUrl: SONG }, { enabled: true, assetUrl: 'javascript:alert(1)' }, { enabled: true, assetUrl: 'data:audio/wav;base64,AAAA' }] as DetailConfig['music'][]) {
        assert.equal(renderGuestPage({ config: withFamily(withMusic(music), familyId), guest: fixtureGuest() }), plain, `${label}: ${JSON.stringify(music)}`);
      }
      process.env.FLAG_GUEST_MUSIC = 'off';
      assert.equal(renderGuestPage({ config: withFamily(withMusic({ enabled: true, assetUrl: SONG }), familyId), guest: fixtureGuest() }), plain, `${label}: flag off`);
      delete process.env.FLAG_GUEST_MUSIC;
    }
  } finally {
    if (previous === undefined) delete process.env.FLAG_GUEST_MUSIC;
    else process.env.FLAG_GUEST_MUSIC = previous;
  }
});

test('B-009: `autoplay: false` and a guest back from a form post get the music without the gate', () => {
  for (const { label, familyId } of LAYOUTS) {
    const manual = renderGuestPage({ config: withFamily(withMusic({ enabled: true, assetUrl: SONG, autoplay: false }), familyId), guest: fixtureGuest() });
    assert.ok(!hasGate(manual), `${label}: no gate when the host turned play-on-open off`);
    assert.equal(audioTags(manual).length, 1);
    assert.match(firstAudio(manual), /preload="none"/);
    for (const status of [{ rsvp: 'saved' }, { wish: 'saved' }, { rsvp: 'busy', rsvpr: '120' }, { wish: 'retry', wishk: 'abc' }]) {
      const back = renderGuestPage({ config: withFamily(withMusic({ enabled: true, assetUrl: SONG }), familyId), guest: fixtureGuest(), status });
      assert.ok(!hasGate(back), `${label}: no gate over the notice (${JSON.stringify(status)})`);
      assert.equal(audioTags(back).length, 1);
    }
  }
});

test('B-009: the gate names the occasion and the people, and greets a guest only on a personal link', () => {
  const html = renderGuestPage({ config: withMusic({ enabled: true, assetUrl: SONG }, { ...base, theme: { cover: { headline: 'The Wedding of' } } }) });
  assert.ok(hasGate(html));
  assert.match(html, />The Wedding of</, "the host's own cover headline is the kicker");
  assert.doesNotMatch(html, /Kepada Yth\./, 'no guest, no greeting');
  assert.doesNotMatch(html, /aria-describedby="sampul-tamu"/);
  const corporate = renderGuestPage({
    invitation: fixtureInvitation({ eventType: 'corporate' }),
    config: withMusic({ enabled: true, assetUrl: SONG }, { corporateProfile: { eventName: 'Peluncuran Produk Contoh' } }),
    guest: fixtureGuest(),
  });
  assert.match(corporate, />Undangan Acara</);
  assert.match(corporate, /Peluncuran Produk Contoh/);
  const untitled = renderGuestPage({ config: withMusic({ enabled: true, assetUrl: SONG }, { settings: { title: 'Syukuran Contoh' } }), guest: fixtureGuest() });
  assert.match(untitled, /id="sampul-judul"[^>]*><span class="block">Syukuran Contoh<\/span>/, 'without names the title heads the gate');
});

test('B-009: the stylesheet opens the gate without JavaScript and holds the page still behind it, outside every layer', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const depthAt = (index: number) => [...css.slice(0, index)].reduce((depth, char) => depth + (char === '{' ? 1 : char === '}' ? -1 : 0), 0);
  const target = css.indexOf('.inv-cover-gate:target {');
  const lock = css.indexOf('html:has(.inv-cover-gate:not([hidden]):not(:target)) {');
  assert.ok(target > 0 && lock > 0, 'both rules exist');
  assert.equal(depthAt(target), 0, 'unlayered, so it beats the gate\u2019s own `flex` utility');
  assert.equal(depthAt(lock), 0);
  assert.match(css.slice(target, css.indexOf('}', target)), /display: none;/);
  assert.match(css.slice(lock, css.indexOf('}', lock)), /overflow: hidden;/);
});

test('B-009: the island starts sound only inside the guest\u2019s tap and never autoplays', () => {
  const source = readFileSync(join(process.cwd(), 'components/invitation/cover-audio.tsx'), 'utf8');
  assert.match(source, /^'use client';/);
  const effects = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/g)].map((match) => match[1]);
  assert.ok(effects.length >= 3, 'the effects were found');
  for (const body of effects) assert.doesNotMatch(body, /play\(\)/, 'no effect starts the music');
  assert.match(source, /function openGate\(withMusic: boolean\) \{[\s\S]*?if \(withMusic\) play\(\);/, 'the tap itself starts it');
  assert.doesNotMatch(source, /autoPlay/, 'no autoplay attribute');
});
