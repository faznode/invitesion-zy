// E-046 (s22): the guest page's decorative icons are one masked element each, their SVGs live once in the shared
// stylesheet. Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
// B-009 adds the music control's two icons; the control lives outside `<main>`, so only the stylesheet test sees them.
// B-025 adds the gallery lightbox's close and step controls and the video poster's play mark.
const NAMES = ['calendar-days', 'calendar-plus', 'clock', 'gift', 'map-pin', 'quote', 'radio', 'volume-2', 'volume-x', 'x', 'chevron-left', 'chevron-right', 'play'] as const;

const config: DetailConfig = {
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  quote: { enabled: true, text: 'Kalimat contoh yang fiktif.' },
  events: [{ title: 'Resepsi', startAt: '2027-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }],
  liveStream: { enabled: true, url: 'https://example.test/live' },
  gifts: { enabled: true, accounts: [{ bank: 'Bank Contoh', accountNumber: '0000000000', accountName: 'Laras' }] },
} as DetailConfig;

test('E-046: no layout renders an inline <svg> icon; every icon is a decorative masked element', () => {
  for (const { label, familyId } of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() });
    const main = html.slice(html.indexOf('<main'), html.lastIndexOf('</main>'));
    assert.doesNotMatch(main, /<svg\b/, `${label}: no inline SVG in the page body`);
    const icons = [...main.matchAll(/<span\b[^>]*class="inv-icon inv-icon-([a-z-]+)[^"]*"[^>]*>/g)];
    assert.ok(icons.length >= 4, `${label}: the event facts, quote, live stream and gift icons render (${icons.length})`);
    for (const [tag, name] of icons) {
      assert.ok((NAMES as readonly string[]).includes(name), `${label}: known icon ${name}`);
      assert.match(tag, /aria-hidden="true"/, `${label}: ${name} is decorative`);
    }
  }
});

test('E-046: the stylesheet defines every icon once, inside the components layer, with the Lucide licence', () => {
  const css = read('app/globals.css');
  const layer = css.slice(css.indexOf('@layer components {'));
  assert.ok(css.includes('@layer components {'), 'utilities must outrank the icon box, so it sits in a layer');
  assert.match(layer, /\.inv-icon \{[^}]*background-color: currentColor;[^}]*mask: var\(--inv-icon\)/);
  for (const name of NAMES) {
    assert.equal(css.split(`.inv-icon-${name} {`).length - 1, 1, `one rule for ${name}`);
  }
  assert.match(css, /forced-colors: active[\s\S]*?background-color: CanvasText/, 'visible in forced-colours mode');
  assert.match(css, /Lucide [\d.]+ \(`lucide-react`\), ISC License/, 'the ISC notice travels with the copied paths');
  for (const file of ['components/invitation/guest-blocks.tsx', 'components/invitation/public-renderer.tsx', 'components/invitation/families/gapura.tsx', 'components/invitation/families/kartu.tsx', 'components/invitation/families/lontar.tsx', 'components/invitation/families/riang.tsx']) {
    assert.doesNotMatch(read(file), /from 'lucide-react'/, `${file} no longer renders lucide icons`);
  }
});
