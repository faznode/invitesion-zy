// B-035: the editor's side-by-side preview is the owner preview (`/preview/<id>`), which renders the guest renderer with
// the host's audience. For the same stored data it must equal what guests receive: byte for byte for content without
// audience rules, on every layout; and where audience rules apply (invite-only events, D-037) the host sees what an
// invitation link hides, never less. The routes themselves share the loader and the renderer (source guard below).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const shared: DetailConfig = {
  couple: { bride: { nickName: 'Sari', fullName: 'Sari Lestari' }, groom: { nickName: 'Budi', fullName: 'Budi Santoso' } },
  events: [{ id: 'ev-resepsi', title: 'Resepsi', startAt: '2099-12-27T19:00:00+08:00', venueName: 'Gedung Contoh' }],
  quote: { enabled: true, text: 'Dua hati, satu langkah.', author: 'Budi & Sari' },
};

test('identical content renders identically in the owner preview and on the public page, on every layout', (t) => {
  // The countdown renders with the request time (B-008), so two renders a second apart differ only in its seconds; the
  // clock is held still so the comparison is about the renderer, as two requests in the same second would be.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  for (const { label, familyId } of LAYOUTS) {
    const config = withFamily(shared, familyId);
    const published = renderGuestPage({ config, guest: null, preview: false });
    const preview = renderGuestPage({ config, guest: null, preview: true });
    assert.ok(published.includes('Dua hati, satu langkah.'), `${label}: the content renders`);
    assert.equal(preview, published, `${label}: the preview equals the published render`);
  }
});

test('where an audience rule applies, the preview shows the host what an invitation link hides', () => {
  const config: DetailConfig = {
    ...shared,
    events: [
      { id: 'ev-akad', title: 'Akad Khusus Keluarga', startAt: '2099-12-27T09:00:00+08:00', inviteOnly: true },
      { id: 'ev-resepsi', title: 'Resepsi', startAt: '2099-12-27T19:00:00+08:00' },
    ],
  };
  for (const { label, familyId } of LAYOUTS) {
    const published = renderGuestPage({ config: withFamily(config, familyId), guest: null, preview: false });
    const preview = renderGuestPage({ config: withFamily(config, familyId), guest: null, preview: true });
    assert.ok(!published.includes('Akad Khusus Keluarga'), `${label}: the link's audience does not see the invite-only event`);
    assert.ok(preview.includes('Akad Khusus Keluarga'), `${label}: the host does`);
    assert.ok(preview.includes('Resepsi') && published.includes('Resepsi'), `${label}: the open event is on both`);
  }
});

test('the preview route and the public route share the loader and the renderer', () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
  const preview = source('app/preview/[id]/page.tsx');
  const published = source('app/i/[slug]/page.tsx');
  for (const page of [preview, published]) {
    assert.match(page, /import \{ PublicInvitationRenderer \} from '@\/components\/invitation\/public-renderer';/);
    assert.match(page, /loadPublicInvitation\(/);
  }
  assert.match(preview, /loadPublicInvitation\(owned\.slug, undefined, true\)/, "the host's audience");
  assert.match(preview, /\n\s+preview\n/, 'the renderer is told it is the preview');
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor-save.tsx');
  assert.match(editor, /<iframe/);
  const page = source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx');
  assert.match(page, /embedPreviewHref=\{`\$\{ownerPreviewPath\(id\)\}\?embed=1`\}/, 'the pane frames the owner preview');
});
