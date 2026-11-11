// G-035 (I-16): the guest page's share actions and the Status / Story image. The shared address is always the invitation
// link and the image is the link preview's public data (B-010), never a guest's. One rule (`inviteShareAvailable`)
// decides the footer and the image route; the legacy layout never shows them (D-041); a host can hide them; the flag off
// is the rollback. Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily, withoutShareActions } from './support/render-guest-page';
import { GuestShareChoice } from '../app/(customer)/dashboard/invitations/[id]/edit/editor-share';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { FAMILY_IDS } from '../lib/invitation/families';
import { GUEST_COPY } from '../lib/invitation/guest-copy';
import { inviteShareAvailable, inviteShareOf } from '../lib/invitation/invite-share';
import { invitationShareMetadata, previewImageModel, previewImageVersion, STORY_IMAGE_SIZE } from '../lib/invitation/preview-image';
import { storyImageResponse } from '../lib/invitation/story-image';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const ON = { FLAG_GUEST_SHARE: 'on' };
const NOW = Date.parse('2026-11-11T00:00:00Z');

const wedding = {
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [{ title: 'Akad Nikah', startAt: '2027-01-10T09:00:00+08:00' }],
  settings: { openingCopy: 'Dengan penuh rasa syukur (fiktif).' },
  theme: { paletteId: 'sage', familyId: 'gapura' },
} as DetailConfig;
const published = (overrides: Parameters<typeof fixtureInvitation>[0] = {}) => fixtureInvitation({ slug: 'laras-dimas', eventType: 'wedding', ...overrides });
const withShare = (config: DetailConfig, guestShare?: boolean): DetailConfig => ({ ...config, settings: { ...config.settings, guestShare } });
const withLanguage = (config: DetailConfig, language: 'id' | 'en'): DetailConfig => ({ ...config, settings: { ...config.settings, language } });
/** The page's footer element alone: a personal page's RSVP form adds React's form-replay script after `</main>`. */
const footerOf = (html: string) => {
  const start = html.lastIndexOf('<footer');
  return html.slice(start, html.indexOf('</footer>', start) + '</footer>'.length);
};
const STORY_HREF = /href="(\/i\/[^"]+\/story\.png\?v=[a-z0-9]+)"/;

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

/** Runs `render` with FLAG_GUEST_SHARE set as given, restoring the environment afterwards. */
function withFlag<T>(value: string | undefined, render: () => T): T {
  const before = process.env.FLAG_GUEST_SHARE;
  if (value === undefined) delete process.env.FLAG_GUEST_SHARE;
  else process.env.FLAG_GUEST_SHARE = value;
  try {
    return render();
  } finally {
    if (before === undefined) delete process.env.FLAG_GUEST_SHARE;
    else process.env.FLAG_GUEST_SHARE = before;
  }
}

test('G-035: the share is the invitation link and its public title, never a guest, with the link preview version', () => {
  const share = inviteShareOf(published(), wedding, NOW, ON);
  assert.ok(share);
  assert.equal(share.path, '/i/laras-dimas');
  assert.equal(share.storyHref, `/i/laras-dimas/story.png?v=${previewImageVersion(previewImageModel('wedding', wedding))}`);
  assert.equal(share.storyFileName, 'laras-dimas-story.png');
  assert.equal(share.title, invitationShareMetadata(published(), wedding).openGraph.title, 'the title the link preview shows');
  assert.equal(share.title, 'Undangan Pernikahan Laras & Dimas');
  assert.equal(inviteShareOf(published(), { ...wedding, settings: { ...wedding.settings, title: 'Pernikahan Laras (fiktif)' } }, NOW, ON)?.title, 'Pernikahan Laras (fiktif)');
  // The address is encoded like every invitation path; nothing of a guest can reach the model, which takes none.
  assert.equal(inviteShareOf(published({ slug: 'laras dimas' }), wedding, NOW, ON)?.path, '/i/laras%20dimas');
  const guest = fixtureGuest();
  assert.ok(!JSON.stringify(share).includes(guest.name) && !JSON.stringify(share).includes(guest.slug));
  // An edit that changes the card changes the image URL, so a cached image is never stale.
  const later = inviteShareOf(published(), { ...wedding, couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas Pratama' } } } as DetailConfig, NOW, ON);
  assert.notEqual(later?.storyHref, share.storyHref);
});

test('G-035: one rule: guest sharing on, published and not expired, a design family, not hidden by the host', () => {
  const available = (invitation: ReturnType<typeof published>, config: DetailConfig, env: Record<string, string | undefined> = ON) => inviteShareAvailable(invitation, config, NOW, env);
  assert.equal(available(published(), wedding), true);
  assert.equal(available(published(), wedding, {}), true, 'on by default');
  assert.equal(available(published(), wedding, { FLAG_GUEST_SHARE: 'off' }), false, 'the rollback');
  assert.equal(available(published({ status: 'DRAFT' }), wedding), false, "a draft's link answers 404");
  assert.equal(available(published({ status: 'EXPIRED' }), wedding), false, 'expired by status');
  assert.equal(available(published({ expiresAt: new Date(NOW - 1_000) }), wedding), false, 'past its expiry');
  assert.equal(available(published({ expiresAt: new Date(NOW + 86_400_000) }), wedding), true, 'before its expiry');
  assert.equal(available(published(), withFamily(wedding, undefined)), false, 'the legacy layout is frozen (D-041)');
  assert.equal(available(published(), withFamily(wedding, 'retired-family')), false, 'a retired family reads as legacy');
  assert.equal(available(published(), withShare(wedding, false)), false, 'hidden by the host');
  assert.equal(available(published(), withShare(wedding, true)), true, 'shown explicitly');
  for (const familyId of FAMILY_IDS) assert.equal(available(published(), withFamily(wedding, familyId)), true, familyId);
  // The page and the image route ask this one question. G-047 (D-069) refuses a passcode-protected invitation first; the
  // one rule itself is unchanged and still decides every other invitation.
  assert.match(source('components/invitation/guest-view.ts'), /inviteShare: inviteShareOf\(invitation, config\),/);
  assert.match(source('app/i/[slug]/story.png/route.ts'), /if \(!summary \|\| passcodeGateActive\(summary\.invitation\) \|\| !inviteShareAvailable\(summary\.invitation, summary\.config\)\) return new Response\('Not found', \{ status: 404 \}\);/);
  assert.match(source('app/i/[slug]/story.png/route.ts'), /loadPublishedInvitationSummary\(slug\)/);
});

test('G-035: every design family offers the actions in its footer, in the page language; the legacy layout never does', () => {
  for (const { label, familyId } of LAYOUTS) {
    for (const language of ['id', 'en'] as const) {
      const config = withLanguage(withFamily(wedding, familyId), language);
      const html = withFlag('on', () => renderGuestPage({ config, invitation: published() }));
      if (!familyId) {
        for (const copy of [GUEST_COPY.id.inviteShare, GUEST_COPY.en.inviteShare]) assert.ok(!html.includes(copy.story) && !html.includes(copy.heading), `${label}: no share actions`);
        assert.ok(!html.includes('/story.png'), `${label}: no Story image`);
        continue;
      }
      const copy = GUEST_COPY[language].inviteShare;
      const footer = footerOf(html);
      assert.ok(footer.includes(`role="group" aria-label="${copy.heading}"`), `${label} ${language}: a named group in the footer`);
      assert.ok(footer.includes(`>${copy.story}</a>`), `${label} ${language}: the Story link`);
      assert.equal(STORY_HREF.exec(footer)?.[1], inviteShareOf(published(), config, Date.now(), ON)?.storyHref, `${label} ${language}`);
      assert.ok(footer.includes('download="laras-dimas-story.png"'), `${label}: downloaded under the invitation's name`);
      // The result's live region arrives with hydration, like the gift's copy button: the server page announces nothing.
      assert.ok(!footer.includes('role="status"') && footer.includes('<p class="min-h-5 text-sm'), `${label}: the result's place is kept, its live region waits for hydration`);
      // Without JavaScript only the download works, so the buttons arrive once hydrated (like the gift's copy button).
      assert.ok(!footer.includes(`>${copy.share}</button>`) && !footer.includes(`>${copy.whatsapp}</button>`), `${label}: buttons wait for hydration`);
      assert.match(footer, /min-h-11/, `${label}: the row keeps a 44 px target height`);
    }
  }
});

test('G-035: the shared and every personal link offer the same share, with nothing of the guest', () => {
  for (const familyId of FAMILY_IDS) {
    const config = withFamily(wedding, familyId);
    const shared = withFlag('on', () => renderGuestPage({ config, invitation: published() }));
    const personal = withFlag('on', () => renderGuestPage({ config, invitation: published(), guest: fixtureGuest() }));
    assert.equal(footerOf(personal), footerOf(shared), familyId);
    assert.ok(!footerOf(personal).includes('budi-hartono') && !footerOf(personal).includes('Budi Hartono'), familyId);
    assert.match(source(`components/invitation/families/${familyId}.tsx`), /<InviteShareActions share=\{view\.inviteShare\} labels=\{view\.copy\.inviteShare\}/, familyId);
  }
  // The island makes the invitation link absolute from the address the guest is on and shares nothing else.
  const island = source('components/invitation/invite-share.tsx');
  assert.match(island, /new URL\(share\.path, window\.location\.origin\)\.href/);
  assert.match(island, /navigator\.share\(\{ title: share\.title, text: share\.title, url \}\)/);
  assert.match(island, /whatsAppShareLink\(`\$\{share\.title\}\\n\$\{invitationLink\(\)\}`\)/);
  // A closed sheet says nothing; any other refusal copies (the Clipboard API, else the legacy command), and where neither
  // works the link is shown to copy by hand. The legacy copy hands focus back to the button that asked.
  assert.match(island, /error\.name === 'AbortError'\) return;/);
  assert.match(island, /if \(\(await writeClipboard\(url\)\) \|\| legacyCopy\(url\)\)/);
  assert.match(island, /document\.execCommand\('copy'\)/);
  assert.match(island, /field\.remove\(\);\s+previous\?\.focus\(\);/);
  assert.match(island, /readOnly\s+autoFocus/);
});

test('G-035: hidden by the host, a draft or the flag off show nothing; hidden and off render the same page', () => {
  for (const familyId of FAMILY_IDS) {
    const config = withFamily(wedding, familyId);
    const off = atOneInstant(() => withFlag('off', () => renderGuestPage({ config, invitation: published() })));
    const hidden = atOneInstant(() => withFlag('on', () => renderGuestPage({ config: withShare(config, false), invitation: published() })));
    assert.ok(!off.includes('/story.png') && !off.includes(GUEST_COPY.id.inviteShare.heading), `${familyId}: flag off`);
    assert.equal(hidden, off, `${familyId}: hiding renders exactly the page the rollback renders`);
    const draft = withFlag('on', () => renderGuestPage({ config, invitation: published({ status: 'DRAFT' }), preview: true }));
    assert.ok(!draft.includes('/story.png'), `${familyId}: a draft's preview offers no link that would answer 404`);
    const expired = withFlag('on', () => renderGuestPage({ config, invitation: published({ status: 'EXPIRED' }), readOnly: true }));
    assert.ok(!expired.includes('/story.png'), `${familyId}: an expired invitation is not passed on`);
  }
});

test('G-035: the rollback is byte-exact: with sharing off a family page is the default page without its share actions', () => {
  // With the B-019 and B-023 digests (pinned on pages through `withoutShareActions`), this proves the flag-off page is the
  // page before G-035, byte for byte, in both languages, on both links and on every family.
  for (const familyId of FAMILY_IDS) {
    for (const language of ['id', 'en'] as const) {
      for (const guest of [fixtureGuest(), null]) {
        const config = withLanguage(withFamily(wedding, familyId), language);
        const on = atOneInstant(() => withFlag('on', () => renderGuestPage({ config, invitation: published(), guest })));
        const off = atOneInstant(() => withFlag('off', () => renderGuestPage({ config, invitation: published(), guest })));
        assert.notEqual(on, off, `${familyId} ${language}: the default page offers the share`);
        assert.equal(withoutShareActions(on), off, `${familyId} ${language} ${guest ? 'personal' : 'shared'}`);
      }
    }
  }
  assert.match(source('components/invitation/invite-share.tsx'), /<p role=\{hydrated \? 'status' : undefined\}/);
});

test('G-035: the Status / Story image is the link preview model on a 1080 x 1920 PNG; hostile names are text', async () => {
  const pngOf = async (response: Response) => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a PNG signature');
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  };
  for (const config of [wedding, withLanguage(withFamily(wedding, 'riang'), 'en'), withFamily({ ...wedding, theme: { paletteId: 'midnight', familyId: 'lontar' } } as DetailConfig, 'lontar')]) {
    assert.deepEqual(await pngOf(storyImageResponse('wedding', config)), STORY_IMAGE_SIZE);
  }
  const response = storyImageResponse('wedding', wedding);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=600');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  // Markup in a name is drawn as literal text; a name outside the bundled font is left out rather than fetched.
  const hostile = { ...wedding, couple: { bride: { nickName: '<img src=x onerror=alert(1)>' }, groom: { nickName: 'Dimas' } } } as DetailConfig;
  assert.equal(previewImageModel('wedding', hostile).imageName, '<img src=x onerror=alert(1)> & Dimas');
  assert.deepEqual(await pngOf(storyImageResponse('wedding', hostile)), STORY_IMAGE_SIZE);
  const rtl = { ...wedding, couple: { bride: { nickName: 'ليلى' }, groom: { nickName: 'Dimas' } } } as DetailConfig;
  assert.equal(previewImageModel('wedding', rtl).imageName, null);
  assert.deepEqual(await pngOf(storyImageResponse('wedding', rtl)), STORY_IMAGE_SIZE);
  // The image reads the model and the palette only: no guest ever reaches it.
  const story = source('lib/invitation/story-image.tsx');
  assert.match(story, /export function storyImageResponse\(eventType: string, config: DetailConfig\)/);
  const imports = [...story.matchAll(/from '([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ['./detail-config', './guest-copy', './preview-image', 'next/og'], 'the model, the palette and the page words only');
  assert.doesNotMatch(story.replace(/\/\*[\s\S]*?\*\//g, ''), /\bguests?\??\./i, 'no guest is read');
});

test('G-035: the editor offers the switch beside the guest language, saves an explicit boolean and names the classic exception', () => {
  const render = (value?: boolean, familyId?: string) => renderToStaticMarkup(createElement(GuestShareChoice, { value, familyId, onChange: () => {} }));
  assert.match(render(undefined, 'gapura'), /type="checkbox"[^>]*checked=""/, 'unset reads as shown');
  assert.doesNotMatch(render(false, 'gapura'), /checked=""/, 'hidden');
  assert.match(render(true, 'kartu'), /tautan undangan umum, tidak pernah tautan pribadinya/);
  assert.match(render(true, undefined), /Tata letak klasik tidak menampilkan tombol bagikan/);
  assert.match(render(true, 'gapura'), /aria-describedby="[^"]+"/);
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(editor, /\{guestShare && <Card title="Bagikan undangan"/);
  assert.match(editor, /onChange=\{\(x\)=>patch\('settings',\{\.\.\.section\('settings'\),guestShare:x\}\)\}/);
  assert.match(source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx'), /guestShare=\{isFlagOn\('GUEST_SHARE'\)\}/);
});

test('G-035: the content contract lists the switch as rendered and the dictionary carries the actions in both languages', () => {
  assert.ok((RENDER_CAPABILITIES.settings.rendered as readonly string[]).includes('guestShare'));
  assert.ok(!(RENDER_CAPABILITIES.settings.storedOnly as readonly string[]).includes('guestShare'));
  for (const language of ['id', 'en'] as const) {
    for (const [key, text] of Object.entries(GUEST_COPY[language].inviteShare)) assert.ok(typeof text === 'string' && text.length > 0, `${language}.${key}`);
  }
  assert.notEqual(GUEST_COPY.en.inviteShare.share, GUEST_COPY.id.inviteShare.share);
});
