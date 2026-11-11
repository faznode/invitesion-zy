// G-036 (I-05): elder-friendly reading. A design-family page offers a large-text switch on its cover; the guest's choice
// is kept on their own device (a cookie the guest routes read) and turns the page to larger text, the palette's own ink
// for muted text (B-016 tokens only) and no motion. The legacy layout never offers it (D-041); the flag off is the
// byte-exact rollback. Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily, withoutReadingToggle } from './support/render-guest-page';
import { ReadingToggle } from '../components/invitation/reading-toggle';
import { contrastRatio, WCAG_AA } from '../lib/invitation/contrast';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { FAMILY_IDS } from '../lib/invitation/families';
import { isFlagOn } from '../lib/flags';
import { GUEST_COPY } from '../lib/invitation/guest-copy';
import { paletteHex, paletteIds } from '../lib/invitation/palettes';
import { READING_COOKIE, READING_COOKIE_MAX_AGE, READING_COOKIE_VALUE, readingModeOf, readingRequested } from '../lib/invitation/reading-mode';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const ON = { FLAG_GUEST_READING: 'on' };
const OFF = { FLAG_GUEST_READING: 'off' };
const TOGGLE_ROW = /<div data-reading-toggle="" class="mt-6 flex min-h-11 (?:justify-center|justify-start)(?: [^"]+)?"><\/div>/g;

const wedding = {
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [{ title: 'Akad Nikah', startAt: '2027-01-10T09:00:00+08:00', venueName: 'Balai Desa (fiktif)' }],
  settings: { openingCopy: 'Dengan penuh rasa syukur (fiktif).' },
  greetings: { enabled: true, prayer: 'Semoga menjadi keluarga yang bahagia (fiktif).' },
  theme: { paletteId: 'sage', familyId: 'gapura' },
} as DetailConfig;
const invitation = fixtureInvitation({ slug: 'laras-dimas', eventType: 'wedding' });
const guest = fixtureGuest({ name: 'Ibu Sri Wahyuni (fiktif)', slug: 'ibu-sri' });
const withLanguage = (config: DetailConfig, language: 'id' | 'en'): DetailConfig => ({ ...config, settings: { ...config.settings, language } });
const coverOf = (html: string) => {
  const start = html.indexOf('<header data-section="cover"');
  return start < 0 ? '' : html.slice(start, html.indexOf('</header>', start) + '</header>'.length);
};
const count = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].length;

/** Runs `body` at one frozen instant: the view reads `Date.now()` for its countdown, so two whole pages compare equal. */
function atOneInstant<T>(body: () => T): T {
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-11T06:00:00Z');
  try {
    return body();
  } finally {
    Date.now = realNow;
  }
}

/** Runs `render` with FLAG_GUEST_READING set as given, restoring the environment afterwards. */
function withFlag<T>(value: string | undefined, render: () => T): T {
  const before = process.env.FLAG_GUEST_READING;
  if (value === undefined) delete process.env.FLAG_GUEST_READING;
  else process.env.FLAG_GUEST_READING = value;
  try {
    return render();
  } finally {
    if (before === undefined) delete process.env.FLAG_GUEST_READING;
    else process.env.FLAG_GUEST_READING = before;
  }
}

test('G-036: guest reading is on by default and FLAG_GUEST_READING=off turns it off', () => {
  assert.equal(isFlagOn('GUEST_READING', {}), true);
  assert.equal(isFlagOn('GUEST_READING', OFF), false);
  assert.equal(isFlagOn('GUEST_READING', { FLAG_GUEST_READING: '0' }), false);
});

test('G-036: only the exact value the switch writes turns the mode on (the cookie is the guest device, never the server)', () => {
  assert.equal(READING_COOKIE, 'inv_reading');
  assert.equal(READING_COOKIE_VALUE, 'large');
  assert.equal(READING_COOKIE_MAX_AGE, 31_536_000, 'a year: kept on every invitation the guest opens on that device');
  assert.equal(readingRequested('large'), true);
  for (const value of [undefined, '', 'LARGE', 'true', '1', 'large ', 'on']) assert.equal(readingRequested(value), false, String(value));
});

test('G-036: one rule, a design family with guest reading on; the legacy layout and a retired family never offer it', () => {
  for (const familyId of FAMILY_IDS) {
    const config = withFamily(wedding, familyId);
    assert.deepEqual(readingModeOf(config, undefined, ON), { on: false }, familyId);
    assert.deepEqual(readingModeOf(config, false, ON), { on: false }, familyId);
    assert.deepEqual(readingModeOf(config, true, ON), { on: true }, familyId);
    assert.equal(readingModeOf(config, true, OFF), null, `${familyId}: flag off`);
  }
  assert.equal(readingModeOf(withFamily(wedding, undefined), true, ON), null, 'legacy layout (D-041)');
  assert.equal(readingModeOf(withFamily(wedding, 'retired-family'), true, ON), null, 'retired family renders the legacy layout');
});

test('G-036: every family offers the switch once, inside its cover, on the shared and the personal link, in both languages', () => {
  for (const familyId of FAMILY_IDS) {
    for (const language of ['id', 'en'] as const) {
      const config = withLanguage(withFamily(wedding, familyId), language);
      for (const [link, pageGuest] of [['shared', null], ['personal', guest]] as const) {
        const label = `${familyId} ${language} ${link}`;
        const page = renderGuestPage({ config, invitation, guest: pageGuest });
        assert.equal(count(page, TOGGLE_ROW), 1, `${label}: one switch row on the page`);
        assert.equal(count(coverOf(page), TOGGLE_ROW), 1, `${label}: the row sits in the cover`);
        assert.ok(!page.includes('data-reading="large"'), `${label}: the default page is not in reading mode`);
        const large = renderGuestPage({ config, invitation, guest: pageGuest, readingLarge: true });
        assert.equal(count(large, /<main [^>]*data-reading="large"/g), 1, `${label}: the device's choice paints from the first byte`);
        assert.equal(count(large, / data-reading="large"/g), 1, `${label}: on the layout's <main> only`);
        assert.equal(count(large, TOGGLE_ROW), 1, `${label}: the switch stays to turn it off`);
      }
    }
  }
});

test('G-036: the switch row is in place before hydration, so the cover never moves when the button arrives', () => {
  for (const familyId of FAMILY_IDS) {
    const row = renderGuestPage({ config: withFamily(wedding, familyId), invitation, guest }).match(TOGGLE_ROW)?.[0] ?? '';
    assert.match(row, /min-h-11/, `${familyId}: the row keeps the button's 44 px height`);
  }
  const kartu = renderGuestPage({ config: withFamily(wedding, 'kartu'), invitation, guest }).match(TOGGLE_ROW)?.[0] ?? '';
  assert.match(kartu, /mx-auto max-w-md/, 'Kartu keeps the row under its card, outside the card shadow');
});

test('G-036: reading mode changes no content: the large page equals the default page apart from the reading state', () => {
  atOneInstant(() => {
    for (const familyId of FAMILY_IDS) {
      for (const pageGuest of [null, guest]) {
        const config = withFamily(wedding, familyId);
        const base = renderGuestPage({ config, invitation, guest: pageGuest });
        const large = renderGuestPage({ config, invitation, guest: pageGuest, readingLarge: true });
        assert.notEqual(large, base);
        assert.equal(large.replace(' data-reading="large"', ''), base, `${familyId}: one attribute is the whole difference`);
      }
    }
  });
});

test('G-036: the flag off is a byte-exact rollback: no switch, the cookie ignored, the page as it was before G-036', () => {
  atOneInstant(() => {
    for (const familyId of FAMILY_IDS) {
      for (const pageGuest of [null, guest]) {
        const config = withFamily(wedding, familyId);
        const base = renderGuestPage({ config, invitation, guest: pageGuest });
        const off = withFlag('off', () => renderGuestPage({ config, invitation, guest: pageGuest, readingLarge: true }));
        assert.equal(count(off, TOGGLE_ROW), 0, `${familyId}: no switch`);
        assert.ok(!off.includes('data-reading'), `${familyId}: the cookie is ignored`);
        assert.equal(off, withoutReadingToggle(base), `${familyId}: the default page without G-036's markup`);
      }
    }
  });
});

test('G-036: the legacy layout is frozen (D-041): no switch and the cookie changes nothing', () => {
  atOneInstant(() => {
    const legacy = LAYOUTS.find((layout) => !layout.familyId);
    assert.ok(legacy);
    const config = withFamily(wedding, legacy.familyId);
    for (const pageGuest of [null, guest]) {
      const base = renderGuestPage({ config, invitation, guest: pageGuest });
      assert.equal(count(base, TOGGLE_ROW), 0);
      assert.ok(!base.includes('data-reading'));
      assert.equal(renderGuestPage({ config, invitation, guest: pageGuest, readingLarge: true }), base);
    }
  });
});

test('G-036: reading help changes nothing a guest can do, so a read-only page and the host preview offer it too', () => {
  const config = withFamily(wedding, 'lontar');
  const expired = renderGuestPage({ config, invitation: fixtureInvitation({ slug: 'laras-dimas', status: 'EXPIRED' }), guest, readOnly: true, readingLarge: true });
  assert.equal(count(expired, TOGGLE_ROW), 1);
  assert.match(expired, /<main [^>]*data-reading="large"/);
  const preview = renderGuestPage({ config, invitation, preview: true });
  assert.equal(count(preview, TOGGLE_ROW), 1);
});

test('G-036: the switch is a toggle button with an announced state, labelled in the page language', () => {
  assert.equal(GUEST_COPY.id.reading.toggle, 'Huruf besar');
  assert.equal(GUEST_COPY.en.reading.toggle, 'Large text');
  const island = source('components/invitation/reading-toggle.tsx');
  assert.match(island, /^'use client';/);
  assert.match(island, /type="button"/);
  assert.match(island, /aria-pressed=\{on\}/);
  assert.match(island, /min-h-11/, '44 px target');
  assert.match(island, /\{labels\.toggle\}/, 'the visible label is the accessible name');
  assert.match(island, /<span aria-hidden="true"[^>]*>\s*Aa\s*<\/span>/, 'the glyph is decorative');
  // Server markup: the row only (the button arrives with hydration, like the share buttons).
  const server = renderToStaticMarkup(createElement(ReadingToggle, { reading: { on: true }, labels: GUEST_COPY.en.reading, accentClass: 'text-x', align: 'center' }));
  assert.equal(server, '<div data-reading-toggle="" class="mt-6 flex min-h-11 justify-center"></div>');
});

test('G-036: the choice is kept on the device for a year, first-party and same-site, and removed when switched off', () => {
  const island = source('components/invitation/reading-toggle.tsx');
  assert.match(island, /`\$\{READING_COOKIE\}=\$\{READING_COOKIE_VALUE\}; Path=\/; Max-Age=\$\{READING_COOKIE_MAX_AGE\}; SameSite=Lax\$\{secure\}`/);
  assert.match(island, /`\$\{READING_COOKIE\}=; Path=\/; Max-Age=0; SameSite=Lax\$\{secure\}`/);
  assert.match(island, /window\.location\.protocol === 'https:' \? '; Secure' : ''/);
  assert.match(island, /closest\('main'\)/, 'it flips the page it sits on at once');
  assert.match(island, /setAttribute\('data-reading', READING_COOKIE_VALUE\)/);
  assert.match(island, /removeAttribute\('data-reading'\)/);
});

test('G-036: every guest route and the host preview read the device cookie through the one rule', () => {
  for (const path of ['app/i/[slug]/page.tsx', 'app/i/[slug]/[guestSlug]/page.tsx', 'app/preview/[id]/page.tsx']) {
    const route = source(path);
    assert.match(route, /readingLarge=\{readingRequested\(\(await cookies\(\)\)\.get\(READING_COOKIE\)\?\.value\)\}/, path);
  }
  assert.match(source('components/invitation/guest-view.ts'), /reading: readingModeOf\(config, readingLarge\)/);
});

test('G-036: the stylesheet enlarges every text size, uses the palette ink for muted text and stops motion, with no new colour', () => {
  const css = source('app/globals.css');
  const start = css.indexOf("main[data-reading='large'] {");
  assert.ok(start > 0);
  const block = css.slice(start, css.indexOf('}', css.indexOf('transition: none !important;')) + 1);
  // Tailwind's default scale, in rem; every size inside reading mode is larger.
  const DEFAULT_REM: Record<string, number> = { xs: 0.75, sm: 0.875, base: 1, lg: 1.125, xl: 1.25, '2xl': 1.5, '3xl': 1.875, '4xl': 2.25, '5xl': 3 };
  for (const [size, rem] of Object.entries(DEFAULT_REM)) {
    const value = Number(new RegExp(`--text-${size}: ([0-9.]+)rem;`).exec(block)?.[1]);
    assert.ok(value > rem, `--text-${size}: ${value} > ${rem}`);
  }
  assert.ok(Number(/font-size: ([0-9.]+)rem;/.exec(block)?.[1]) > 1, 'unclassed text grows too');
  assert.match(block, /main\[data-reading='large'\] \.text-\\\(--inv-muted\\\) \{\s*color: var\(--inv-ink\);\s*\}/);
  assert.match(block, /animation: none !important;/);
  assert.match(block, /transition: none !important;/);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i, 'B-016: no colour outside the palette tokens');
});

test('G-036: muted text in reading mode takes the palette ink, which out-contrasts it on every surface of every palette', () => {
  for (const id of paletteIds) {
    const tokens = paletteHex(id);
    for (const surface of ['bg', 'card', 'soft', 'field'] as const) {
      const ink = contrastRatio(tokens.ink, tokens[surface]);
      const muted = contrastRatio(tokens.muted, tokens[surface]);
      assert.ok(ink >= WCAG_AA.text, `${id} ink on ${surface}: ${ink.toFixed(2)}`);
      assert.ok(ink >= muted, `${id} on ${surface}: ink ${ink.toFixed(2)} >= muted ${muted.toFixed(2)}`);
    }
  }
});

test('G-036: the four families wire the same switch and state (no per-family variant of the rule)', () => {
  for (const familyId of FAMILY_IDS) {
    const layout = source(`components/invitation/families/${familyId}.tsx`);
    assert.match(layout, /\{view\.reading && <ReadingToggle reading=\{view\.reading\} labels=\{view\.copy\.reading\} accentClass=\{tone\.accent\} align="(?:center|start)"/, familyId);
    assert.match(layout, /data-reading=\{view\.reading\?\.on \? 'large' : undefined\}/, familyId);
  }
});
