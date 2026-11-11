// G-061 (B-022 rule): every help article matches shipped behaviour. An article is published only while every capability
// it describes is available in the deployment; the labels it quotes are rendered by the files it names; the routes it
// sends readers to exist; a flag-gated feature it mentions is among its capabilities; nothing pending (credit prices,
// a licensed PJP, payouts) is ever described. Unpublishing = removing the article or switching its capability's flag off.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HELP_ARTICLES, HELP_TOPICS, publishedHelpArticle, publishedHelpArticles, type HelpArticle } from '../lib/help/articles';
import { CAPABILITIES, capabilityStatus, type CapabilityId } from '../lib/marketing/capabilities';
import { buildMarketingPages } from '../app/marketing-registry';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const LOCALES = ['id', 'en'] as const;
const textOf = (article: HelpArticle, locale: (typeof LOCALES)[number]) => {
  const copy = article.copy[locale];
  return [copy.title, copy.summary, ...copy.steps, ...(copy.notes ?? [])].join('\n');
};
const allText = (article: HelpArticle) => LOCALES.map((locale) => textOf(article, locale)).join('\n');

/** Words that claim a flag-gated feature, and the capabilities that may back them. */
const GATED_WORDS: Array<[RegExp, CapabilityId[]]> = [
  [/ruang kerja|workspace|reseller/i, ['resellerWorkspace']],
  [/kuitansi|receipt/i, ['receipts']],
  [/kupon|coupon/i, ['coupons']],
  [/\bQR\b|check-in/i, ['guestPass', 'checkInScanner']],
  [/co-host|usher|penerima tamu|tim undangan/i, ['teamAccess']],
  [/\bimpor\b|\bimport\b/i, ['guestImport']],
  [/pendaftaran mandiri|self-registration|tautan pendaftaran/i, ['selfRegistration']],
  [/kursi|seating|suvenir|souvenir|catatan kado|gift log/i, ['seatingLog', 'giftLog']],
  [/buku ucapan|wishes book/i, ['wishesBook']],
  [/musik|music/i, ['music']],
  [/hitung mundur|countdown|kalender|calendar/i, ['countdownCalendar']],
  [/pertanyaan|question/i, ['rsvpQuestions', 'answerSummary']],
  [/per acara|per event/i, ['rsvpPerEvent']],
  [/mungkin hadir|\bmaybe\b/i, ['rsvpMaybe']],
  [/whatsapp/i, ['whatsappLinks']],
  // Guest-data exports; a receipt's own PDF is covered by `receipts` above.
  [/ekspor|export|\bcsv\b/i, ['guestCsvExport', 'wishesBook', 'seatingLog']],
];

/** Pending or external capabilities that no article may describe while they wait for the owner. */
const PENDING = /\bPJP\b|acquirer|komisi|commission|payout|pencairan|kredit|credit|top-?up|white-?label|afiliasi|affiliate/i;

/** Every page and route file under `app/`, as a URL pattern without route groups. */
function appRoutes(dir = join(root, 'app'), prefix = ''): Set<string> {
  const routes = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      const segment = /^\(.*\)$/.test(entry) ? '' : `/${entry}`;
      for (const route of appRoutes(path, `${prefix}${segment}`)) routes.add(route);
    } else if (/^(page|route)\.tsx?$/.test(entry)) {
      routes.add(prefix || '/');
    }
  }
  return routes;
}

test('G-061: articles are complete in both languages, with unique English slugs and known topics', () => {
  const slugs = new Set<string>();
  for (const article of HELP_ARTICLES) {
    assert.match(article.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, article.slug);
    assert.ok(!slugs.has(article.slug), `duplicate ${article.slug}`);
    slugs.add(article.slug);
    assert.ok(article.topic in HELP_TOPICS, `${article.slug} topic`);
    const [id, en] = LOCALES.map((locale) => article.copy[locale]);
    for (const copy of [id, en]) {
      assert.ok(copy.title.trim() && copy.summary.trim() && copy.steps.length >= 2, `${article.slug} copy`);
      for (const step of copy.steps) assert.ok(step.trim().length > 10, `${article.slug} step`);
    }
    assert.equal(en.steps.length, id.steps.length, `${article.slug}: the same steps in both languages`);
    assert.equal(en.notes?.length ?? 0, id.notes?.length ?? 0, `${article.slug}: the same notes in both languages`);
    assert.notEqual(en.title, id.title, `${article.slug}: the English title is translated`);
  }
});

test('G-061: an article describes only built capabilities, and is published exactly while all of them are available', () => {
  const flagged = (article: HelpArticle) => article.needs.map((id) => CAPABILITIES[id]).filter((c) => 'flag' in c && c.flag).map((c) => `FLAG_${(c as { flag: string }).flag}`);
  for (const article of HELP_ARTICLES) {
    assert.ok(article.needs.length > 0, `${article.slug} names its capabilities`);
    for (const id of article.needs) {
      assert.ok(id in CAPABILITIES, `${article.slug}: ${id} is a capability`);
      assert.equal(CAPABILITIES[id].built, 'yes', `${article.slug}: ${id} is built (roadmap and unsupported capabilities are never described)`);
    }
    const on = Object.fromEntries(flagged(article).map((flag) => [flag, 'on']));
    assert.ok(publishedHelpArticle(article.slug, on), `${article.slug} publishes with its flags on`);
    for (const flag of flagged(article)) {
      assert.equal(publishedHelpArticle(article.slug, { ...on, [flag]: 'off' }), null, `${article.slug} unpublished with ${flag} off`);
    }
  }
  const defaults = publishedHelpArticles({}).map((article) => article.slug);
  assert.deepEqual(defaults, ['create-your-first-invitation', 'add-guests-and-send-personal-links', 'follow-rsvps-and-opens', 'moderate-and-reply-to-wishes'], 'the default deployment publishes the guides of default-on features only');
  for (const slug of ['run-a-reseller-workspace', 'download-a-payment-receipt', 'use-a-coupon-code']) {
    assert.equal(publishedHelpArticle(slug, {}), null, `${slug} stays unpublished while its flag is off (the default)`);
  }
  assert.ok(publishedHelpArticle('run-a-reseller-workspace', { FLAG_WORKSPACES: 'on', FLAG_GUEST_PASS: 'on' }));
  assert.equal(publishedHelpArticle('run-a-reseller-workspace', { FLAG_WORKSPACES: 'on' }), null, 'the workspace guide also waits for the check-in desk it describes');
  assert.ok(publishedHelpArticle('download-a-payment-receipt', { FLAG_RECEIPTS: 'on' }));
  assert.ok(publishedHelpArticle('use-a-coupon-code', { FLAG_COUPONS: 'on' }));
  assert.equal(publishedHelpArticle('no-such-guide', {}), null);
});

test('G-061: every quoted label is listed with the file that renders it, and that file renders it', () => {
  for (const article of HELP_ARTICLES) {
    const listed = new Set(article.uiTerms.map((term) => term.text));
    for (const locale of LOCALES) {
      for (const [, quoted] of textOf(article, locale).matchAll(/“([^”]+)”/g)) {
        assert.ok(listed.has(quoted), `${article.slug} (${locale}) quotes “${quoted}” without naming the file that renders it`);
      }
    }
    for (const term of article.uiTerms) {
      assert.ok(existsSync(join(root, term.source)), `${article.slug}: ${term.source} exists`);
      assert.ok(source(term.source).includes(term.text), `${article.slug}: “${term.text}” is rendered by ${term.source}`);
      assert.ok(LOCALES.some((locale) => textOf(article, locale).includes(`“${term.text}”`)), `${article.slug}: “${term.text}” is quoted in the copy`);
    }
  }
});

test('G-061: every route an article sends readers to exists', () => {
  const routes = appRoutes();
  for (const article of HELP_ARTICLES) {
    for (const route of article.routes) assert.ok(routes.has(route), `${article.slug}: ${route} resolves to a page under app/`);
    assert.ok(routes.has(`/resources/help-center/[slug]`), 'the article route exists');
  }
});

test('G-061: a flag-gated feature an article mentions is among its capabilities, and nothing pending is described', () => {
  for (const article of HELP_ARTICLES) {
    const text = allText(article);
    for (const [word, backers] of GATED_WORDS) {
      if (word.test(text)) assert.ok(backers.some((id) => article.needs.includes(id)), `${article.slug} mentions ${word} without ${backers.join(' or ')}`);
    }
    assert.doesNotMatch(text, PENDING, `${article.slug} describes a pending capability`);
  }
  for (const id of ['workspaceCredits'] as const) {
    assert.equal(capabilityStatus(id, {}), 'roadmap', `${id} stays roadmap`);
    assert.ok(!HELP_ARTICLES.some((article) => article.needs.includes(id)), `no article describes ${id}`);
  }
});

test('G-061: the help centre is a shipped capability; its pages read only published articles and 404 the rest', () => {
  assert.equal(capabilityStatus('helpArticles', {}), 'available');
  const helpCentre = buildMarketingPages({}).resources.find((page) => page.slug === 'help-center');
  assert.equal(helpCentre?.status, 'available', 'the resources card and the header and footer links stay available');
  assert.ok(helpCentre?.highlights.every((highlight) => highlight.status === 'available'), 'the card no longer calls the guides planned');
  const index = source('app/resources/help-center/page.tsx');
  const article = source('app/resources/help-center/[slug]/page.tsx');
  assert.match(index, /publishedHelpArticles\(\)/);
  assert.doesNotMatch(index, /HELP_ARTICLES/, 'the index never lists unpublished articles');
  assert.match(article, /const article = publishedHelpArticle\(slug\);\s*if \(!article\) notFound\(\);/);
  assert.doesNotMatch(article, /HELP_ARTICLES/);
  assert.match(source('app/resources/[slug]/page.tsx'), /OWN_ROUTES = new Set\(\['help-center'\]\)/, 'the generic resources page leaves the help centre to its own route');
});
