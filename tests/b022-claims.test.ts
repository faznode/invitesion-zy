// B-022 (G-023, QA-024): marketing claims match shipped behaviour. Every claim names the capabilities it relies on;
// this file cross-checks them against `lib/marketing/capabilities.ts`, the flags and the guest page's render map.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildMarketingPages,
  marketingPageCopy,
  marketingPageMetadata,
  marketingTitles,
  slugifyMarketingTitle,
  type MarketingCategory,
  type MarketingPage,
} from '../app/marketing-registry';
import { marketingClaimNeeds, marketingCopy } from '../app/marketing-copy';
import { CAPABILITIES, claimStatus, type CapabilityDefinition, type CapabilityId } from '../lib/marketing/capabilities';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const CATEGORIES: MarketingCategory[] = ['event-types', 'features', 'resources'];
const capabilityList = Object.entries(CAPABILITIES) as Array<[CapabilityId, CapabilityDefinition]>;
const flagNames = [...new Set(capabilityList.map(([, capability]) => capability.flag).filter((flag): flag is NonNullable<typeof flag> => !!flag))];
const ENVS = {
  defaults: {} as Record<string, string>,
  allOff: Object.fromEntries(flagNames.map((flag) => [`FLAG_${flag}`, 'off'])),
  allOn: Object.fromEntries(flagNames.map((flag) => [`FLAG_${flag}`, 'on'])),
};
const pagesBy = (env: Record<string, string>) => buildMarketingPages(env);
const find = (pages: ReturnType<typeof buildMarketingPages>, category: MarketingCategory, slug: string): MarketingPage => {
  const page = pages[category].find((candidate) => candidate.slug === slug);
  assert.ok(page, `${category}/${slug} exists`);
  return page;
};

/** A word in the copy that makes a claim, and the capabilities that may back it. */
const LEXICON: Array<[RegExp, CapabilityId[]]> = [
  [/\bQR\b|check-in/i, ['guestPass', 'checkInScanner']],
  [/cashless|iuran|donasi|kontribusi|amplop|donation|envelope/i, ['giftAccounts', 'cashlessCollection', 'giftLog']],
  [/pengingat|reminder/i, ['followUpLists', 'whatsappAutomation']],
  [/sekali klik|one click|blast|massal|bulk/i, ['whatsappAutomation']],
  [/e-?mail/i, ['emailSending', 'supportEmail']],
  [/kursi|denah|seating|tempat duduk/i, ['seatingLog', 'seatingChartEditor']],
  [/tiket|ticket/i, ['ticketing']],
  [/salesforce|hubspot/i, ['crmIntegrations']],
  [/zapier|webhook/i, ['automationIntegrations']],
  [/google analytics/i, ['thirdPartyAnalytics']],
  [/\bAPI\b/, ['publicApi', 'whatsappAutomation']],
  [/kuota|kapasitas|quota|capacity/i, ['registrationCapacity']],
  [/inggris|english|dwibahasa|bilingual/i, ['interfaceBilingual', 'guestPageBilingual']],
  [/\bpeta\b|\bmaps?\b/i, ['mapLink']],
  [/video/i, ['videoEmbeds', 'livestreamLink']],
  [/musik|music/i, ['music']],
  [/galeri|gallery/i, ['gallery']],
  [/hitung mundur|countdown/i, ['countdownCalendar']],
  [/\bimpor\b|\bimport\b/i, ['guestImport']],
  [/ekspor|unduh|export|download/i, ['guestCsvExport', 'wishesBook', 'seatingLog']],
  [/\bcsv\b/i, ['guestCsvExport', 'guestImport', 'seatingLog']],
  [/co-host|petugas|usher/i, ['teamAccess']],
  [/membuka undangan|pembukaan|belum membuka/i, ['openTracking']],
  [/whatsapp/i, ['whatsappLinks', 'whatsappAutomation', 'invitationPage']],
  [/tautan pendaftaran|pendaftaran terbuka/i, ['selfRegistration']],
];

function unbackedWords(text: string, needs: readonly CapabilityId[]) {
  return LEXICON.filter(([word, backers]) => word.test(text) && !backers.some((id) => needs.includes(id))).map(([word]) => String(word));
}

test('B-022: every built capability points at a real file; guest-page ones render a field; roadmap ones have a backlog row', () => {
  const backlog = source('invitation-research/09-masterplan/06-backlog.md');
  for (const [id, capability] of capabilityList) {
    if (capability.built === 'yes') assert.ok(existsSync(join(process.cwd(), capability.evidence)), `${id}: ${capability.evidence} exists`);
    if (capability.built === 'roadmap') {
      const row = /^[GBI]-\d{3}\b/.exec(capability.evidence)?.[0];
      assert.ok(row && backlog.includes(`| ${row} |`), `${id}: roadmap row ${row} is in the backlog`);
    }
    for (const section of capability.sections ?? []) {
      assert.ok(RENDER_CAPABILITIES[section].rendered.length > 0, `${id}: section ${section} renders to guests`);
    }
  }
  // The host-only configuration sections stay unclaimable as guest-facing features while they are config only.
  for (const section of ['ticketing', 'seatingPlan', 'communications', 'checkInSettings', 'mealPreferences'] as const) {
    assert.equal(RENDER_CAPABILITIES[section].rendered.length, 0, `${section} is still host-only`);
    assert.ok(!capabilityList.some(([, capability]) => capability.sections?.includes(section)), `no capability claims ${section} on the guest page`);
  }
});

test('B-022: every feature and resource has hand-written copy, and every claim names its capabilities', () => {
  for (const category of CATEGORIES) {
    const slugs = marketingTitles[category].map(slugifyMarketingTitle);
    assert.equal(new Set(slugs).size, slugs.length, `${category}: slugs are unique`);
    for (const key of Object.keys(marketingPageCopy[category])) assert.ok(slugs.includes(key), `${category}: copy for ${key} has a title`);
    if (category !== 'event-types') for (const slug of slugs) assert.ok(marketingPageCopy[category][slug], `${category}/${slug} has hand-written copy`);
  }
  for (const category of CATEGORIES) {
    for (const page of buildMarketingPages(ENVS.defaults)[category]) {
      if (page.availability === 'available') assert.ok(page.summaryNeeds.length > 0, `${category}/${page.slug}: the summary names its capabilities`);
      else assert.equal(page.summaryNeeds.length, 0, `${category}/${page.slug}: an unavailable page's summary claims nothing`);
      for (const highlight of page.highlights) assert.ok(highlight.needs.length > 0, `${category}/${page.slug}: "${highlight.title}" names its capabilities`);
    }
  }
});

test('B-022: copy that mentions a capability names it (registry and homepage, both locales)', () => {
  for (const category of CATEGORIES) {
    for (const page of buildMarketingPages(ENVS.defaults)[category]) {
      const pageNeeds = [...page.summaryNeeds, ...page.highlights.flatMap((highlight) => highlight.needs)];
      assert.deepEqual(unbackedWords(page.summary, pageNeeds), [], `${category}/${page.slug}: summary`);
      for (const highlight of page.highlights) {
        assert.deepEqual(unbackedWords(`${highlight.title} ${highlight.text}`, highlight.needs), [], `${category}/${page.slug}: "${highlight.title}"`);
      }
    }
  }
  for (const locale of ['id', 'en'] as const) {
    for (const [key, needsList] of Object.entries(marketingClaimNeeds)) {
      const items = marketingCopy[locale][key as keyof typeof marketingClaimNeeds] as readonly unknown[];
      assert.equal(items.length, needsList.length, `${locale}.${key}: one capability list per item`);
      items.forEach((item, index) => {
        const text = typeof item === 'string' ? item : JSON.stringify(item);
        assert.deepEqual(unbackedWords(text, needsList[index]), [], `${locale}.${key}[${index}] ${text.slice(0, 60)}`);
      });
    }
  }
});

test('B-022: unavailable claims are labelled; available pages never lead with a roadmap or unsupported claim', () => {
  for (const [name, env] of Object.entries(ENVS)) {
    const pages = pagesBy(env);
    for (const category of CATEGORIES) {
      for (const page of pages[category]) {
        if (page.availability === 'available') assert.ok(['available', 'conditional'].includes(page.status), `${name}: ${category}/${page.slug} is ${page.status}`);
        else assert.equal(page.status, page.availability, `${name}: ${category}/${page.slug}`);
        for (const highlight of page.highlights) assert.equal(highlight.status, claimStatus(highlight.needs, env), `${name}: ${page.slug} "${highlight.title}"`);
      }
    }
  }
});

test('B-022: the mismatches found in the audit stay resolved, with flags off and on', () => {
  const defaults = pagesBy(ENVS.defaults);
  const allOn = pagesBy(ENVS.allOn);
  // Flagged QR check-in is not a general-availability promise until the owner switches FLAG_GUEST_PASS on.
  for (const slug of ['qr-code-rsvps', 'event-check-in-app', 'live-attendance']) {
    assert.equal(find(defaults, 'features', slug).status, 'conditional', `${slug} by default`);
    assert.equal(find(allOn, 'features', slug).status, 'available', `${slug} with the flags on`);
  }
  assert.equal(find(defaults, 'event-types', 'conferences').highlights.find((h) => h.needs.includes('guestPass'))?.status, 'conditional');
  // Owner seating logs are not a drag-and-drop seating chart.
  const seating = find(allOn, 'features', 'seating-charts');
  assert.equal(find(defaults, 'features', 'seating-charts').status, 'conditional');
  assert.equal(seating.status, 'available');
  assert.equal(seating.highlights.find((h) => h.needs.includes('seatingChartEditor'))?.status, 'unsupported');
  // Gift accounts and gift logs are not collecting, processing or reconciling cashless gifts, dues or donations.
  for (const env of Object.values(ENVS)) {
    for (const category of CATEGORIES) {
      for (const page of pagesBy(env)[category]) {
        for (const highlight of page.highlights) {
          if (highlight.needs.includes('cashlessCollection')) assert.equal(highlight.status, 'unsupported', `${page.slug}: "${highlight.title}"`);
        }
        assert.ok(!page.summaryNeeds.includes('cashlessCollection'), `${page.slug}: no summary claims cashless collection`);
      }
    }
  }
  for (const slug of ['payment-processing', 'donations', 'event-ticketing', 'email-communications', 'embeddable-forms', 'badge-printing', 'appointment-scheduling', 'salesforce', 'hubspot', 'stripe', 'google-analytics', 'zapier']) {
    assert.equal(find(allOn, 'features', slug).status, 'unsupported', `${slug} names no integration or processing that does not exist`);
  }
  // Shipped analytics and guest export are available, not roadmap.
  assert.equal(find(pagesBy(ENVS.allOff), 'features', 'analytics-and-reporting').status, 'available');
  assert.equal(find(defaults, 'features', 'api-and-export').status, 'available');
  // Public links cannot take an RSVP: open registration is the flagged self-registration link.
  assert.equal(find(defaults, 'features', 'event-registration').highlights.find((h) => h.needs.includes('selfRegistration'))?.status, 'conditional');
  // WhatsApp is one tap per guest; automated sending is roadmap only.
  for (const locale of ['id', 'en'] as const) assert.doesNotMatch(JSON.stringify(marketingCopy[locale].heroSlides), /sekali klik|one click/i);
});

test('B-022: homepage lists claim only what ships; the roadmap lists only what has not', () => {
  for (const [key, needsList] of Object.entries(marketingClaimNeeds)) {
    needsList.forEach((needs, index) => {
      const status = claimStatus(needs, ENVS.defaults);
      if (key === 'roadmapItems') assert.ok(status === 'conditional' || status === 'roadmap', `${key}[${index}] is ${status}`);
      else assert.equal(status, 'available', `${key}[${index}] (${needs.join(', ')})`);
    });
  }
  for (const locale of ['id', 'en'] as const) {
    assert.doesNotMatch(marketingCopy[locale].roadmapItems.join(' '), /analytics|analitik|export|ekspor|cashless|drag/i);
  }
});

test('B-022: navigation links only to shipped features, and every marketing link resolves', () => {
  const defaults = pagesBy(ENVS.defaults);
  const header = source('app/marketing-header.tsx');
  const navLinks = [...header.matchAll(/href: '\/(event-types|features|resources)\/([a-z0-9-]+)'/g)].map(([, category, slug]) => [category as MarketingCategory, slug] as const);
  assert.ok(navLinks.length >= 25, 'the header lists its marketing links');
  for (const [category, slug] of navLinks) assert.equal(find(defaults, category, slug).status, 'available', `nav link ${category}/${slug}`);
  const footer = source('app/marketing-footer.tsx');
  for (const [, slug] of footer.matchAll(/href="\/resources\/([a-z0-9-]+)"/g)) assert.equal(find(defaults, 'resources', slug).status, 'available', `footer link ${slug}`);
  for (const [, slug] of source('app/marketing-copy.ts').matchAll(/href: '\/features\/([a-z0-9-]+)'/g)) assert.equal(find(defaults, 'features', slug).status, 'available', `homepage card ${slug}`);
});

test('B-022: every URL is kept, and only pages whose claims are available are offered to search engines', () => {
  const pages = pagesBy(ENVS.defaults);
  assert.deepEqual(CATEGORIES.map((category) => pages[category].length), [50, 28, 14]);
  for (const [category, slug] of [['features', 'salesforce'], ['features', 'event-ticketing'], ['resources', 'careers'], ['event-types', 'weddings']] as const) find(pages, category, slug);
  for (const category of CATEGORIES) {
    for (const page of pages[category]) {
      const metadata = marketingPageMetadata(page);
      assert.equal(metadata.description, page.summary);
      if (page.status === 'available') assert.equal(metadata.robots, undefined, `${page.slug} indexable`);
      else assert.deepEqual(metadata.robots, { index: false, follow: true }, `${page.slug} kept out of search`);
    }
  }
});
