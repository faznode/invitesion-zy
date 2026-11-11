// B-032 (G-060, I-13) → I-11: a memorial (tahlilan) starts sober: music, gift and countdown off, no opening words and no
// religious text. Creation and the wizard keep it sober, the guest page never borrows the thanksgiving labels, stored
// invitations render as before, and religious text reaches a page only as an approved corpus entry printed with its
// provenance (the shipped corpus is empty, so none does). Fictional data only; the corpus entries below exist only in
// this test process.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';
import { buildGuestView } from '../components/invitation/guest-view';
import { ceremonyProfileOf } from '../lib/invitation/ceremony-profile';
import { detailConfigSchema, type DetailConfig } from '../lib/invitation/detail-config';
import { defaultFamilyFor } from '../lib/invitation/families';
import { isMemorial, MEMORIAL_COPY, occasionOf, occasionOfCategory } from '../lib/invitation/occasion';
import {
  approvedCorpusOptions,
  findUnverifiedReligiousText,
  loadCorpus,
  looksReligious,
  provenanceLine,
  verifiedBlockFor,
  type ReligiousTextEntry,
} from '../lib/invitation/religious-text';
import { catalogDefaultConfig } from '../lib/invitation/template-defaults';
import { templateEventTypes } from '../lib/invitation/template-event-types';
import { invitationTemplates } from '../lib/invitation/templates';
import { themeSwitchOptions } from '../lib/invitation/theme-switch';
import { EMPTY_TRIAL_INPUT, initialDraftConfig, trialFieldsFor, trialSaveIssues } from '../lib/invitation/trial';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const memorialTemplates = invitationTemplates.filter((template) => occasionOfCategory(template.category) === 'memorial');
const KEY = '0f0e0d0c-0b0a-4908-8706-050403020100';
const AHEAD = new Date(Date.now() + 40 * 86_400_000).toISOString();
const CELEBRATORY = /\b(syukur\w*|tasyakuran|thanksgiving|rayakan|merayakan|perayaan|bahagia|berbahagia|pesta|selamat|meriah|ceria|celebrat\w*|party|joy\w*|happy)\b/i;

/** Every string a value holds, depth first. */
const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

const trial = { input: { ...EMPTY_TRIAL_INPUT, first: 'Alm. Bapak Contoh', date: '2026-12-03', time: '19:30' }, key: KEY };

function createdFrom(slug: string, env: Record<string, string | undefined> = {}) {
  const template = invitationTemplates.find((candidate) => candidate.slug === slug)!;
  return initialDraftConfig(catalogDefaultConfig(template), templateEventTypes[template.category], trial, env);
}

/** A published memorial page as a family would draw it: a future event, plus music and gift details the host left off. */
function memorialPage(overrides: Partial<DetailConfig> = {}): DetailConfig {
  const { config } = createdFrom('doa-khusyuk');
  return detailConfigSchema.parse({
    ...config,
    events: [{ id: 'ev-memorial01', title: 'Tahlilan & Doa Bersama', startAt: AHEAD, venueName: 'Kediaman Keluarga', address: 'Jalan Contoh 14' }],
    music: { enabled: false, assetUrl: 'https://audio.example.com/contoh.mp3' },
    gift: { ...config.gift, enabled: false, accounts: [{ kind: 'bank', label: 'Bank Contoh', number: '1234567890', holder: 'Keluarga Contoh' }] },
    ...overrides,
  });
}

const memorialInvitation = fixtureInvitation({ eventType: 'tasyakuran', slug: 'tahlil-contoh' });

test('B-032: the registry has memorial templates, all tahlilan on the tasyakuran event type', () => {
  assert.ok(memorialTemplates.length >= 1);
  for (const template of memorialTemplates) {
    assert.equal(template.category, 'tahlilan', template.slug);
    assert.equal(templateEventTypes[template.category], 'tasyakuran', template.slug);
  }
  assert.deepEqual(
    invitationTemplates.filter((template) => template.category === 'tahlilan').map((template) => template.slug),
    memorialTemplates.map((template) => template.slug),
    'every tahlilan template is a memorial',
  );
});

test('B-032: a memorial preset starts sober: music, gift and countdown off, no opening words, no religious or celebratory text', () => {
  for (const template of memorialTemplates) {
    const preset = template.preset;
    assert.equal(preset.settings?.occasion, 'memorial', template.slug);
    assert.equal(preset.settings?.countdown, false, `${template.slug}: countdown off`);
    assert.equal(preset.settings?.openingCopy, undefined, `${template.slug}: the opening words are the family's own`);
    assert.equal(preset.music?.enabled, false, `${template.slug}: music off`);
    assert.equal(preset.gift?.enabled, false, `${template.slug}: gift off`);
    assert.equal(preset.greetings?.prayer, undefined, `${template.slug}: no prayer text`);
    assert.notEqual(preset.quote?.enabled, true, `${template.slug}: no quote`);
    assert.deepEqual(findUnverifiedReligiousText(preset), [], template.slug);
    const words = [...strings(preset), ...strings(template.sample), ...strings(template.tagline)];
    assert.deepEqual(words.filter((text) => looksReligious(text)), [], `${template.slug}: no religious wording`);
    assert.deepEqual(words.filter((text) => CELEBRATORY.test(text)), [], `${template.slug}: no celebratory wording`);
  }
});

test('B-032: creation keeps the memorial defaults and starts it on a calm family with a sober first event', () => {
  const { config, presetIssues } = createdFrom('doa-khusyuk');
  assert.deepEqual(presetIssues, []);
  assert.equal(config.settings?.occasion, 'memorial');
  assert.equal(config.settings?.countdown, false);
  assert.equal(config.settings?.openingCopy, undefined);
  assert.equal(config.music?.enabled, false);
  assert.deepEqual(config.gift, { enabled: false, personalOnly: true }, 'B-026 personal-only default, still off');
  assert.equal(config.theme?.familyId, 'gapura', 'never the bunting of Riang');
  assert.equal(config.theme?.familyId, defaultFamilyFor('tasyakuran', 'memorial'));
  assert.equal(config.events?.[0]?.title, MEMORIAL_COPY.firstEventTitle.id);
  assert.equal(config.ceremonyProfile?.nickName, 'Alm. Bapak Contoh');
  assert.equal(createdFrom('doa-khusyuk', { FLAG_DEFAULT_FAMILY: 'off' }).config.theme?.familyId, undefined, 'flag off: legacy, as before');
});

test('B-032: a celebration on the same event type is created exactly as before', () => {
  const celebration = invitationTemplates.find((template) => template.category === 'syukuran')!;
  const { config } = createdFrom(celebration.slug);
  assert.equal(occasionOf(config), undefined);
  assert.equal(config.settings?.countdown, undefined);
  assert.equal(config.theme?.familyId, 'riang');
  assert.equal(config.events?.[0]?.title, 'Tasyakuran');
  assert.equal(defaultFamilyFor('tasyakuran'), 'riang');
});

test('B-032: the wizard asks for the one remembered and checks that name', () => {
  assert.deepEqual(trialFieldsFor('tasyakuran', 'memorial'), { first: MEMORIAL_COPY.nameField, second: null, secondRequired: false });
  assert.deepEqual(trialFieldsFor('tasyakuran'), { first: 'Nama tuan rumah', second: null, secondRequired: false }, 'celebrations unchanged');
  const [issue] = trialSaveIssues('tasyakuran', EMPTY_TRIAL_INPUT, 'memorial');
  assert.deepEqual(issue, { field: 'first', message: `${MEMORIAL_COPY.nameField} wajib diisi.` });
  const page = source('app/buat/[slug]/page.tsx');
  assert.match(page, /trialFieldsFor\(eventType, occasion\)/);
  assert.match(page, /themeSwitchOptions\(eventType, undefined, occasion\)/);
  assert.match(page, /occasionOfCategory\(stateTemplate\.category\) === occasion/, 'typed names never carry from a celebration into a memorial');
  assert.match(source('app/buat/actions.ts'), /trialSaveIssues\(templateEventTypes\[template\.category\], state, occasionOfCategory\(template\.category\)\)/);
});

test('B-032: a memorial is offered memorial themes only; celebrations keep their whole list', () => {
  const memorialIds = memorialTemplates.map((template) => template.id).sort();
  assert.deepEqual(themeSwitchOptions('tasyakuran', undefined, 'memorial').map((option) => option.id).sort(), memorialIds);
  const everyTasyakuran = invitationTemplates.filter((template) => templateEventTypes[template.category] === 'tasyakuran');
  assert.equal(themeSwitchOptions('tasyakuran').length, everyTasyakuran.length, 'without an occasion the list is unchanged');
  const celebration = invitationTemplates.find((template) => template.category === 'syukuran')!;
  assert.equal(themeSwitchOptions('tasyakuran', celebration.id, 'memorial')[0].id, celebration.id, 'the theme in use stays offered');
  assert.match(source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx'), /themeSwitchOptions\(invitation\.eventType, [^\n]*occasionOf\(config\)\)/);
});

test('B-032: on every layout a memorial page has no countdown, music or gift, keeps the calendar links and never says thanksgiving', () => {
  const config = memorialPage();
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), invitation: memorialInvitation, guest: fixtureGuest() });
    assert.doesNotMatch(page, /role="timer"/, `${label}: no countdown`);
    assert.match(page, /Simpan ke Google Calendar/, `${label}: the calendar links stay`);
    assert.doesNotMatch(page, /<audio/, `${label}: no music`);
    assert.doesNotMatch(page, /1234567890|Bank Contoh/, `${label}: no gift details`);
    assert.doesNotMatch(page, /Tasyakuran|syukur/i, `${label}: no thanksgiving label`);
    const counting = renderGuestPage({ config: withFamily({ ...config, settings: { ...config.settings, countdown: true } }, familyId), invitation: memorialInvitation, guest: fixtureGuest() });
    assert.match(counting, /role="timer"/, `${label}: the host can switch the countdown on`);
  }
});

test('B-032: the countdown switch decides the countdown only; an absent switch counts down as before', () => {
  const invitation = fixtureInvitation();
  const base: DetailConfig = { events: [{ id: 'ev-acara01', title: 'Resepsi', startAt: AHEAD, venueName: 'Aula Contoh' }] };
  const view = (config: DetailConfig) => buildGuestView({ invitation, config, guest: null, media: [], messages: [], readOnly: false, status: {} });
  assert.equal(view(base).showCountdown, true);
  assert.ok(view(base).primaryCalendarEvent);
  const off = view({ ...base, settings: { countdown: false } });
  assert.equal(off.showCountdown, false);
  assert.deepEqual(off.primaryCalendarEvent, view(base).primaryCalendarEvent, 'the calendar entry is unchanged');
  assert.equal(detailConfigSchema.safeParse({ settings: { countdown: 'no' } }).success, false);
});

test('B-032: the memorial profile names who is remembered and the family, never the thanksgiving fields', () => {
  const input = {
    honoureeName: 'Soedirman Contoh',
    nickName: 'Alm. Bapak Contoh',
    parents: 'Keluarga besar Bapak Contoh',
    ceremonyNote: 'Pesan contoh dari keluarga.',
    thanksgivingCategory: 'promotion' as const,
    thanksgivingTitle: 'Judul contoh',
    achievement: 'Jabatan contoh',
  };
  assert.deepEqual(ceremonyProfileOf('tasyakuran', input, null, 'memorial'), {
    heading: MEMORIAL_COPY.profileHeading,
    rows: [
      { label: 'Nama lengkap', value: 'Soedirman Contoh' },
      { label: 'Keluarga', value: 'Keluarga besar Bapak Contoh' },
    ],
    texts: [{ label: 'Pesan keluarga', text: 'Pesan contoh dari keluarga.' }],
  });
  assert.equal(ceremonyProfileOf('tasyakuran', input)?.heading, 'Tentang Syukuran', 'a stored celebration keeps its heading');
  const page = renderGuestPage({ config: memorialPage({ ceremonyProfile: input }), invitation: memorialInvitation, guest: fixtureGuest() });
  assert.match(page, /Dalam Kenangan/);
  assert.doesNotMatch(page, /Jenis syukuran|Pesan syukur|Jabatan contoh/);
});

test('B-032: stored invitations without an occasion read exactly as before; the cover gate never says thanksgiving for a memorial', () => {
  // A memorial created before B-032 kept its event type's behaviour: it is customer content and is not rewritten.
  const legacyMemorial: DetailConfig = { events: [{ id: 'ev-lama0001', title: 'Tahlil', startAt: AHEAD }], settings: { openingCopy: 'Teks lama keluarga.' } };
  const stored = buildGuestView({ invitation: memorialInvitation, config: legacyMemorial, guest: null, media: [], messages: [], readOnly: false, status: {} });
  assert.equal(stored.occasion, undefined);
  assert.equal(stored.showCountdown, true);
  const music = { enabled: true, assetUrl: 'https://audio.example.com/contoh.mp3' };
  const celebrationGate = renderGuestPage({ config: { music }, invitation: memorialInvitation, guest: fixtureGuest() });
  assert.match(celebrationGate, /Undangan Tasyakuran/, 'a celebration keeps its kicker');
  const memorialGate = renderGuestPage({ config: { music, settings: { occasion: 'memorial' } }, invitation: memorialInvitation, guest: fixtureGuest() });
  assert.match(memorialGate, /Undangan Tahlilan &amp; Doa/);
  assert.doesNotMatch(memorialGate, /Tasyakuran/);
  assert.equal(occasionOf({ settings: { occasion: 'wedding' } }), undefined);
  assert.equal(isMemorial(null), false);
  assert.equal(detailConfigSchema.safeParse({ settings: { occasion: 'birthday' } }).success, false, 'only declared occasions are stored');
});

test('B-032: the editor speaks of a memorial in its own words and offers the countdown switch', () => {
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(editor, /if\(tab==='couple' && memorial\)/, 'the memorial profile form comes before the thanksgiving one');
  assert.ok(editor.indexOf("if(tab==='couple' && memorial)") < editor.indexOf("if(tab==='couple' && eventType==='tasyakuran')"));
  assert.match(editor, /Tampilkan hitung mundur menuju acara pertama[^\n]*countdown:x\}/, 'the switch always sends a boolean');
  assert.match(editor, /corpusId:x\}/, "a cleared reference is sent as ''");
});

// ── I-11: verified religious text, the owner-approved corpus only ──────────────────────────────────────────────────

const ENTRY: ReligiousTextEntry = {
  id: 'contoh-teks-satu',
  tradition: 'contoh',
  kind: 'verse',
  language: 'id',
  text: 'Teks contoh yang sudah disetujui.',
  citation: 'Kitab Contoh 1:1',
  source: 'Penerbit Contoh, 2026, edisi 1',
  translationEdition: 'Terjemahan Contoh rev. 2',
  licence: 'Izin tertulis contoh',
  verifiedBy: 'Pemeriksa Contoh',
  verifiedAt: '2026-11-01',
  approvedBy: 'Pemilik Contoh',
  status: 'approved',
};
const PENDING: ReligiousTextEntry = { ...ENTRY, id: 'contoh-teks-dua', text: 'Teks contoh yang menunggu.', status: 'pending', approvedBy: undefined };
const SYNTHETIC = loadCorpus({ schemaVersion: 1, entries: [ENTRY, PENDING] });

test('I-11: only an approved entry resolves, with its provenance; the shipped corpus resolves nothing', () => {
  const block = verifiedBlockFor('contoh-teks-satu', SYNTHETIC);
  assert.deepEqual(block, {
    id: 'contoh-teks-satu',
    text: 'Teks contoh yang sudah disetujui.',
    citation: 'Kitab Contoh 1:1',
    language: 'id',
    source: 'Penerbit Contoh, 2026, edisi 1',
    translationEdition: 'Terjemahan Contoh rev. 2',
    verifiedBy: 'Pemeriksa Contoh',
    verifiedAt: '2026-11-01',
  });
  assert.equal(provenanceLine(block!), 'Sumber: Penerbit Contoh, 2026, edisi 1, Terjemahan Contoh rev. 2. Diperiksa oleh Pemeriksa Contoh (2026-11-01).');
  for (const id of ['contoh-teks-dua', 'tidak-ada', '', undefined, null]) assert.equal(verifiedBlockFor(id, SYNTHETIC), null, String(id));
  assert.deepEqual(approvedCorpusOptions(SYNTHETIC), [{ id: 'contoh-teks-satu', label: 'Kitab Contoh 1:1 (id)' }]);
  assert.deepEqual(loadCorpus().entries, [], 'the shipped corpus is empty by design (ADR-O04)');
  assert.deepEqual(approvedCorpusOptions(), []);
  assert.equal(verifiedBlockFor('contoh-teks-satu'), null);
});

test('I-11: a reference counts as verified only while it names an approved entry; the schema takes ids or none', () => {
  assert.deepEqual(findUnverifiedReligiousText({ quote: { enabled: true, corpusId: 'contoh-teks-satu' } }, SYNTHETIC), []);
  assert.deepEqual(findUnverifiedReligiousText({ quote: { enabled: true, corpusId: 'contoh-teks-dua' } }, SYNTHETIC), [{ path: 'quote.corpusId', text: 'contoh-teks-dua' }]);
  assert.equal(detailConfigSchema.safeParse({ quote: { enabled: true, corpusId: 'contoh-teks-satu' } }).success, true);
  assert.equal(detailConfigSchema.safeParse({ quote: { enabled: true, corpusId: '' } }).success, true, "'' clears a reference");
  assert.equal(detailConfigSchema.safeParse({ quote: { enabled: true, corpusId: 'Bukan Id' } }).success, false);
});

test('I-11: on the families a reference shows the approved entry with its provenance, and nothing when it is not approved', () => {
  const quoted = (corpusId: string): DetailConfig => ({ quote: { enabled: true, corpusId, text: 'Kata-kata tuan rumah', author: 'Tuan rumah' } });
  const families = LAYOUTS.filter((layout) => layout.familyId);
  // The empty, shipped corpus: a reference renders nothing, never the host's text in its place.
  for (const { label, familyId } of families) {
    const page = renderGuestPage({ config: withFamily(quoted('contoh-teks-satu'), familyId), guest: fixtureGuest() });
    assert.doesNotMatch(page, /Kata-kata tuan rumah|Kitab Contoh/, label);
    const own = renderGuestPage({ config: withFamily({ quote: { enabled: true, text: 'Kata-kata tuan rumah', author: 'Tuan rumah' } }, familyId), guest: fixtureGuest() });
    assert.match(own, /Kata-kata tuan rumah/, `${label}: without a reference the host's own words show`);
    assert.doesNotMatch(own, /Sumber:/, `${label}: no provenance line for the host's words`);
  }
  // The corpus file as the product loads it, extended inside this process only and restored afterwards.
  const shipped = require('../content/verified-religious-texts/corpus.json') as { entries: ReligiousTextEntry[] };
  shipped.entries.push(ENTRY, PENDING);
  try {
    for (const { label, familyId } of families) {
      const page = renderGuestPage({ config: withFamily(quoted('contoh-teks-satu'), familyId), guest: fixtureGuest() });
      assert.match(page, /Teks contoh yang sudah disetujui\./, `${label}: the entry's own text`);
      assert.match(page, /Kitab Contoh 1:1/, `${label}: its citation`);
      assert.match(page, /Sumber: Penerbit Contoh, 2026, edisi 1, Terjemahan Contoh rev\. 2\. Diperiksa oleh Pemeriksa Contoh \(2026-11-01\)\./, `${label}: its provenance`);
      assert.doesNotMatch(page, /Kata-kata tuan rumah/, `${label}: the entry replaces the typed quote`);
      const pending = renderGuestPage({ config: withFamily(quoted('contoh-teks-dua'), familyId), guest: fixtureGuest() });
      assert.doesNotMatch(pending, /Teks contoh yang menunggu|Kata-kata tuan rumah/, `${label}: a pending entry shows nothing`);
    }
  } finally {
    shipped.entries.splice(0);
  }
  assert.deepEqual(loadCorpus().entries, []);
});

test('I-11 / D-041: the frozen legacy layout keeps showing the typed quote, never an entry, and the editor promises the entry on a family only', () => {
  const shipped = require('../content/verified-religious-texts/corpus.json') as { entries: ReligiousTextEntry[] };
  shipped.entries.push(ENTRY);
  try {
    const page = renderGuestPage({ config: withFamily({ quote: { enabled: true, corpusId: 'contoh-teks-satu', text: 'Kata-kata tuan rumah', author: 'Tuan rumah' } }), guest: fixtureGuest() });
    assert.match(page, /Kata-kata tuan rumah/, 'legacy renders the stored quote as before');
    assert.doesNotMatch(page, /Teks contoh yang sudah disetujui|Kitab Contoh|Sumber:/, 'legacy never renders a corpus entry or its provenance');
  } finally {
    shipped.entries.splice(0);
  }
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(
    editor,
    /familyOf\(section\('theme'\)\?\.familyId\)\?'Teks terpilih tampil[^']*menggantikan quote di atas\.':'Tata letak klasik belum menampilkan teks terverifikasi/,
    'the replacement is promised only where the renderer picks a family',
  );
});
