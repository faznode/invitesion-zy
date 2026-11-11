// Scratch (git-ignored): G-018 browser acceptance on the served build (real proxy, cookie Clerk stub).
//   node accept-g018.cjs   (servers: :3100 defaults + guest passes, :3101 FLAG_GUEST_LANGUAGE=off)
'use strict';
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const H = '/vercel/share/work/s49-browser/harness/node_modules/';
const puppeteer = require(H + 'puppeteer-core');
const axeSource = readFileSync(H + 'axe-core/axe.min.js', 'utf8');

const ON = 'http://127.0.0.1:3100';
const OFF = 'http://127.0.0.1:3101';
const DB = 'postgres://postgres@127.0.0.1:5433/s49_browser';
const SHOTS = '/tmp/agent-browser/s49-g018';
require('node:fs').mkdirSync(SHOTS, { recursive: true });
const results = [];
// Observations recorded with the run that are not G-018 acceptance criteria.
const notes = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 200)})` : ''}`);
};
const sql = (query) => execFileSync('psql', [DB, '-qAt', '-c', query], { encoding: 'utf8' }).trim();
const idOf = (slug) => Number(sql(`select id from invitations where slug = '${slug}'`));
const settingsOf = (slug) => JSON.parse(sql(`select coalesce(config->'settings', '{}'::jsonb) from invitations where slug = '${slug}'`));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const curl = (args) => execFileSync('curl', ['-s', ...args], { encoding: 'utf8' });

const ID_WORDS = ['Konfirmasi Kehadiran', 'Kepada Yth.', 'Simpan ke Google Calendar', 'Unduh kalender', 'Kirim ucapan', 'Rangkaian Acara', 'Lihat lokasi', 'Ya, saya hadir', 'Maaf, belum bisa', 'Undangan digital oleh Invitesion'];

async function main() {
  // Re-runnable: put the fixture rows this run changes back to their seeded state.
  sql(`update invitations set config = config #- '{settings,language}' #- '{theme,cover,headline}' where slug in ('review-gapura-full', 'review-legacy-full')`);
  sql(`update invitation_versions v set config = i.config from invitations i where v.invitation_id = i.id and v.is_live and i.slug in ('review-gapura-full', 'review-legacy-full')`);
  sql(`update invitations set status = 'PUBLISHED' where slug = 'review-kartu-birthday'`);
  sql(`update invitations set deleted_at = null, purge_after = null where slug = 'review-riang-birthday'`);
  sql(`update invitations set config = config #- '{settings,language}' where slug = 'review-riang-full'`);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--lang=id-ID'],
  });
  const consoleErrors = [];
  async function open(url, { cookie, language = 'id-ID,id;q=0.9', width = 390, height = 844, reducedMotion = false, expectStatus } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setBypassCSP(true);
    await page.setViewport({ width, height });
    await page.setExtraHTTPHeaders({ 'Accept-Language': language });
    if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (cookie) await context.setCookie({ name: 'stub_user', value: cookie, domain: '127.0.0.1', path: '/' });
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Content Security Policy|report-only|404 \(Not Found\)/i.test(message.text())) consoleErrors.push(`${url}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${url}: ${error.message}`));
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.bringToFront();
    if (expectStatus !== undefined && response.status() !== expectStatus) throw new Error(`${url} answered ${response.status()}`);
    return { page, context, response };
  }
  const text = (page) => page.evaluate(() => document.body.innerText);
  const docLang = (page) => page.evaluate(() => document.documentElement.lang);
  const meta = (page, property) => page.evaluate((p) => document.querySelector(`meta[property="${p}"]`)?.getAttribute('content') ?? null, property);
  async function axe(page, label) {
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => `${v.id}(${v.nodes.length})`));
    check(`${label}: axe clean`, violations.length === 0, violations.join(', '));
  }
  async function noOverflow(page, label) {
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(`${label}: no horizontal overflow`, scroll <= inner, `${scroll} > ${inner}`);
  }
  async function editorLanguage(base, slug, cookie) {
    const { page, context } = await open(`${base}/dashboard/invitations/${idOf(slug)}/edit`, { cookie, width: 1280, height: 900 });
    const tile = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Tema & Cover')));
    await tile.asElement().click();
    await sleep(500);
    return { page, context };
  }
  // The tab holds other fieldsets (the theme picker comes first); the language one is found by its legend.
  const languageFieldset = () => [...document.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent === 'Bahasa untuk tamu') ?? null;
  const inLanguage = (page, fn) => page.evaluate(`(${fn})((${languageFieldset})())`);
  const checkedLanguage = (page) => inLanguage(page, (f) => f?.querySelector('input[type=radio]:checked')?.value ?? null);
  const focusCheckedLanguage = (page) => inLanguage(page, (f) => { f.querySelector('input[type=radio]:checked').focus(); return true; });
  async function saveAndWait(page, slug, key, expected) {
    const button = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => /^(Simpan|Save)$/.test(b.textContent.trim())));
    await button.asElement().click();
    for (let i = 0; i < 40; i++) {
      if (settingsOf(slug)[key] === expected) return true;
      await sleep(250);
    }
    return false;
  }

  // ── A. Editor: ID → EN on a design family, keyboard only, saved through the normal save ──────────────────────────
  const slug = 'review-gapura-full';
  const before = settingsOf(slug);
  {
    const { page, context } = await editorLanguage(ON, slug, 'user_s49_owner');
    const cardTitle = await inLanguage(page, (f) => f?.closest('section')?.querySelector('h2')?.textContent ?? null);
    check('editor: the language choice sits in Tema & Cover', cardTitle === 'Bahasa halaman tamu', cardTitle);
    check('editor: a stored Indonesian / unset language reads Indonesian', (await checkedLanguage(page)) === 'id', await checkedLanguage(page));
    const hint = await inLanguage(page, (f) => f?.querySelector('p')?.textContent ?? '');
    check('editor: a family gets the scope hint, not the classic one', hint.includes('Berlaku juga untuk') && !hint.includes('klasik'), hint);
    await focusCheckedLanguage(page);
    await page.keyboard.press('ArrowRight');
    const focusVisible = await page.evaluate(() => document.activeElement?.matches(':focus-visible') && document.activeElement?.value);
    check('editor: the keyboard moves to English with a visible focus', (await checkedLanguage(page)) === 'en' && focusVisible === 'en', String(focusVisible));
    const card = await page.evaluateHandle(`(${languageFieldset})().closest('section')`);
    await page.addScriptTag({ content: axeSource });
    const cardViolations = await page.evaluate(async (el) => (await window.axe.run(el)).violations.map((v) => v.id), card);
    check('editor: the language card is axe clean', cardViolations.length === 0, cardViolations.join(','));
    check('editor: the save stores settings.language = en', await saveAndWait(page, slug, 'language', 'en'));
    const after = settingsOf(slug);
    const others = Object.keys({ ...before, ...after }).filter((key) => key !== 'language' && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    check('editor: every other setting is kept', others.length === 0, others.join(','));
    await page.screenshot({ path: `${SHOTS}/editor-en.png` });
    await page.reload({ waitUntil: 'networkidle0' });
    const tile = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Tema & Cover')));
    await tile.asElement().click();
    await sleep(400);
    check('editor: the reload reads English', (await checkedLanguage(page)) === 'en');
    await context.close();
  }

  // ── B. English on every guest surface ─────────────────────────────────────────────────────────────────────────
  const storedStrings = JSON.stringify(sql(`select config from invitations where slug = '${slug}'`));
  const leaks = (body) => ID_WORDS.filter((word) => body.includes(word) && !storedStrings.includes(word));
  {
    const { page, context } = await open(`${ON}/preview/${idOf(slug)}`, { cookie: 'user_s49_owner', width: 1280, height: 900 });
    const mainLang = await page.evaluate(() => document.querySelector('main')?.getAttribute('lang'));
    const body = await text(page);
    check('preview: the owner preview renders English', mainLang === 'en' && body.includes('Will You Attend?') && leaks(body).length === 0, `${mainLang} ${leaks(body)}`);
    await context.close();
  }
  for (const [label, path] of [['shared link', `/i/${slug}`], ['personal link', `/i/${slug}/budi-hartono`]]) {
    for (const [width, height] of [[390, 844], [1280, 900]]) {
      const { page, context } = await open(`${ON}${path}`, { width, height, language: 'id-ID,id;q=0.9' });
      const body = await text(page);
      check(`${label} ${width}: the document is English for an Indonesian visitor`, (await docLang(page)) === 'en', await docLang(page));
      check(`${label} ${width}: English words, no Indonesian product words`, body.includes('Will You Attend?') && leaks(body).length === 0, leaks(body).join('|'));
      if (width === 390) {
        check(`${label}: Open Graph locale en_GB`, (await meta(page, 'og:locale')) === 'en_GB', await meta(page, 'og:locale'));
        const title = await page.title();
        check(`${label}: title is the host's or English`, title === (before.title || 'Digital Invitation'), title);
      }
      await noOverflow(page, `${label} ${width}`);
      await axe(page, `${label} ${width}`);
      await page.screenshot({ path: `${SHOTS}/${label.replace(' ', '-')}-en-${width}.png`, fullPage: false });
      await context.close();
    }
  }
  {
    const { page, context } = await open(`${ON}/i/${slug}/budi-hartono`, { width: 390, height: 844 });
    const body = await text(page);
    // innerText applies the label's `uppercase`; compare without case.
    check('personal link: greets in English', /\bDear\b/i.test(body) && !/Kepada Yth/i.test(body) && body.includes('Budi Hartono'));
    const timer = await page.evaluate(() => document.querySelector('[role=timer]')?.getAttribute('aria-label') ?? null);
    check('personal link: the countdown is announced in English', !timer || /\bdays? until\b/.test(timer), timer);
    // Keyboard reaches the RSVP answers with a visible focus.
    let reached = null;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => (document.activeElement?.matches('button[name=status]') && document.activeElement.matches(':focus-visible') ? document.activeElement.textContent.trim() : null));
    }
    check('personal link: Tab reaches an English RSVP answer with a visible focus', Boolean(reached) && !/hadir|bisa/i.test(reached), reached);
    // RSVP success through the real action.
    const yes = await page.evaluateHandle(() => document.querySelector('button[name=status][value=CONFIRMED]'));
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), yes.asElement().click()]);
    const saved = await text(page);
    check('RSVP: success is confirmed in English', saved.includes('Thank you, we have received your reply.'), page.url());
    // RSVP refusal: an answer the action does not know.
    await page.evaluate(() => { const b = document.querySelector('button[name=status][value=CONFIRMED]'); b.value = 'BOGUS'; });
    const bogus = await page.evaluateHandle(() => document.querySelector('button[name=status][value=BOGUS]'));
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), bogus.asElement().click()]);
    check('RSVP: a refusal is explained in English', (await text(page)).includes('That reply was not recognised. Please try again.'), page.url());
    // Wish success, then a refusal from the server (the browser's own check removed).
    await page.type('textarea[name=message]', 'Semoga bahagia selalu (fiktif)');
    const send = await page.evaluateHandle(() => [...document.querySelectorAll('button[type=submit]')].find((b) => b.textContent.trim() === 'Send wish'));
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), send.asElement().click()]);
    const wished = await text(page);
    check('wishes: success is confirmed in English', /Thank you for your wish\.|Thank you\. Your wish (has been passed on|will appear)/.test(wished), page.url());
    await page.evaluate(() => { const t = document.querySelector('textarea[name=message]'); t.removeAttribute('required'); t.value = '   '; });
    const again = await page.evaluateHandle(() => [...document.querySelectorAll('button[type=submit]')].find((b) => b.textContent.trim() === 'Send wish'));
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), again.asElement().click()]);
    check('wishes: a refusal is explained in English', (await text(page)).includes('A wish cannot be empty or longer than 1,000 characters.'), page.url());
    await context.close();
  }
  {
    // One rule (`guestPassAvailable`) decides the pass link, the pass page, its title and the document language.
    const passHrefOf = (html) => /href="(\/i\/[^"]+\/pass)"/.exec(html)?.[1] ?? null;
    check('personal link: offers its pass (guest passes on, opted in)', passHrefOf(curl([`${ON}/i/${slug}/budi-hartono`])) === `/i/${slug}/budi-hartono/pass`);
    check('personal link: no pass link with guest passes off (:3101)', passHrefOf(curl([`${OFF}/i/${slug}/budi-hartono`])) === null);
    check('personal link: no pass link where the invitation has not opted in', passHrefOf(curl([`${ON}/i/review-riang-full/budi-hartono`])) === null);
  }
  {
    const { page, context } = await open(`${ON}/i/${slug}/nama-panjang`, { width: 390, height: 844 });
    await noOverflow(page, 'personal link, long name');
    await page.screenshot({ path: `${SHOTS}/personal-long-name-en.png` });
    await context.close();
  }
  {
    const { page, context } = await open(`${ON}/i/${slug}/budi-hartono`, { width: 390, height: 844, reducedMotion: true });
    await sleep(300);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    check('personal link: reduced motion leaves no running animation', running === 0, running);
    await context.close();
  }
  {
    const { page, context, response } = await open(`${ON}/i/${slug}/budi-hartono/pass`, { width: 390, height: 844 });
    const body = await text(page);
    const alt = await page.evaluate(() => document.querySelector('main img')?.getAttribute('alt') ?? null);
    check('pass: served', response.status() === 200, response.status());
    check('pass: document and page are English', (await docLang(page)) === 'en' && (await page.evaluate(() => document.querySelector('main')?.lang)) === 'en');
    check('pass: title, instructions and back link in English', (await page.title()) === 'Guest QR pass' && body.includes('Show this QR code at the reception desk') && body.includes('Back to the invitation'), await page.title());
    check('pass: the QR alt names the guest in English', alt === 'QR pass for Budi Hartono', alt);
    await axe(page, 'pass');
    await page.screenshot({ path: `${SHOTS}/pass-en.png` });
    await context.close();
  }
  for (const [label, path, code] of [['pass on the shared link', `/i/${slug}/pass`, '404'], ['pass of an unknown guest', `/i/${slug}/tamu-tidak-ada/pass`, '404'], ['pass, invitation not opted in', `/i/review-riang-full/budi-hartono/pass`, '404']]) {
    const status = curl(['-o', '/dev/null', '-w', '%{http_code}', `${ON}${path}`]);
    check(`${label}: ${code}`, status === code, status);
  }
  {
    const offStatus = curl(['-o', '/dev/null', '-w', '%{http_code}', `${OFF}/i/${slug}/budi-hartono/pass`]);
    check('pass with guest passes off (:3101): 404', offStatus === '404', offStatus);
    // An expired pass: the opted-in fixture's events moved into the past for this check only.
    sql(`update invitations set config = jsonb_set(jsonb_set(config, '{events,0,startAt}', '"2026-01-10T10:00:00+07:00"'), '{events,0,endAt}', '"2026-01-10T13:00:00+07:00"') where slug = 'review-kartu-aqiqah'`);
    sql(`update invitations set config = config || jsonb_build_object('settings', coalesce(config->'settings', '{}'::jsonb) || '{"language":"en"}'::jsonb) where slug = 'review-kartu-aqiqah'`);
    const { page, context } = await open(`${ON}/i/review-kartu-aqiqah/budi-hartono/pass`);
    const body = await text(page);
    check('pass: an expired pass says so in English, with no QR', body.includes('This pass is no longer valid because the event has passed.') && !(await page.$('main img')));
    await context.close();
  }
  {
    const og = execFileSync('curl', ['-s', '-o', '/tmp/s49-og-en.png', '-w', '%{http_code} %{content_type}', `${ON}/i/${slug}/og.png`], { encoding: 'utf8' });
    check('og.png: served as an image', og.startsWith('200 image/png'), og);
    const ics = curl(['-i', `${ON}/i/${slug}/calendar.ics`]);
    check('calendar.ics: served with the host\'s event title', /^HTTP\/1\.1 200/.test(ics) && /text\/calendar/i.test(ics) && /SUMMARY:/.test(ics), ics.split('\n')[0]);
    writeFileSync('/tmp/s49-ics-en.ics', ics);
  }

  // ── C. Proxy and root layout: the route decides, never a client header; other pages keep the visitor's locale ──
  const htmlLang = (html) => /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1];
  check('proxy: an English invitation stays English for an Indonesian visitor', htmlLang(curl(['-H', 'Accept-Language: id-ID', `${ON}/i/${slug}/budi-hartono`])) === 'en');
  check('proxy: an Indonesian invitation stays Indonesian for an English visitor', htmlLang(curl(['-H', 'Accept-Language: en-US', `${ON}/i/review-kartu-full/budi-hartono`])) === 'id');
  check('proxy: a forged route header on the home page is ignored', htmlLang(curl(['-H', 'Accept-Language: id-ID', '-H', `x-guest-route: ${slug}`, `${ON}/`])) === 'id');
  check('proxy: a forged route header on another guest page is ignored', htmlLang(curl(['-H', 'Accept-Language: en-US', '-H', `x-guest-route: ${slug}`, `${ON}/i/review-kartu-full/budi-hartono`])) === 'id');
  check('proxy: a non-guest page keeps the visitor locale (en)', htmlLang(curl(['-H', 'Accept-Language: en-US', `${ON}/templates`])) === 'en');
  sql(`update invitations set status = 'DRAFT' where slug = 'review-kartu-birthday'`);
  sql(`update invitations set deleted_at = now(), purge_after = now() + interval '30 days' where slug = 'review-riang-birthday'`);
  // An English invitation that has not opted in to passes: its guests' pass pages do not exist.
  sql(`update invitations set config = jsonb_set(config, '{settings}', coalesce(config->'settings', '{}'::jsonb) || '{"language":"en"}'::jsonb) where slug = 'review-riang-full'`);
  // Every guest 404 is the app's own 404 in the visitor's locale: document, heading and title alike, nothing of the invitation.
  const NOT_FOUND = { en: ['Page not found', 'Invitation not found'], id: ['Halaman tidak ditemukan', 'Undangan tidak ditemukan'] };
  for (const [label, path, visitor] of [
    ['unknown invitation', '/i/tidak-ada-undangan', 'en'],
    ['unpublished invitation', '/i/review-kartu-birthday', 'en'],
    ['deleted invitation', '/i/review-riang-birthday/budi-hartono', 'en'],
    ['unknown guest', `/i/${slug}/tamu-tidak-ada`, 'en'],
    ['pass of an unknown guest', `/i/${slug}/tamu-tidak-ada/pass`, 'en'],
    ['pass of an English invitation not opted in', '/i/review-riang-full/budi-hartono/pass', 'id'],
    ['pass of an English invitation not opted in', '/i/review-riang-full/budi-hartono/pass', 'en'],
  ]) {
    const { page, context, response } = await open(`${ON}${path}`, { language: visitor === 'en' ? 'en-US,en;q=0.9' : 'id-ID,id;q=0.9' });
    const [h1, title] = await page.evaluate(() => [document.querySelector('h1')?.textContent ?? null, document.title]);
    const lang = await docLang(page);
    check(`404, ${label}, ${visitor} visitor: document, heading and title in the visitor's locale`, response.status() === 404 && lang === visitor && h1 === NOT_FOUND[visitor][0] && title === NOT_FOUND[visitor][1], `${response.status()} ${lang} ${h1} | ${title}`);
    await context.close();
  }
  sql(`update invitations set config = config #- '{settings,language}' where slug = 'review-riang-full'`);
  // The server HTML of a page-level notFound() is Next 16's recovery shell app-wide (the editor's 404 too): recorded only.
  for (const path of ['/i/tidak-ada-undangan', '/dashboard/invitations/999999/edit']) {
    const html = curl(['-b', 'stub_user=user_s49_owner', '-H', 'Accept-Language: en-US', `${ON}${path}`]);
    notes.push(`server HTML of ${path}: ${/<html id="__next_error__">/.test(html) ? 'Next recovery shell <html id="__next_error__">, lang only after hydration' : `<html lang="${htmlLang(html)}">`}`);
  }

  // ── D. Flag off (:3101): Indonesian everywhere, no control, the stored preference kept ────────────────────────
  {
    const { page, context } = await open(`${OFF}/i/${slug}/budi-hartono`);
    const body = await text(page);
    check('flag off: the guest page is Indonesian with lang=id', (await docLang(page)) === 'id' && body.includes('Konfirmasi Kehadiran') && !body.includes('Will You Attend?'));
    check('flag off: Open Graph locale id_ID', (await meta(page, 'og:locale')) === 'id_ID');
    await context.close();
    const editor = await editorLanguage(OFF, slug, 'user_s49_owner');
    check('flag off: the editor offers no language choice', (await inLanguage(editor.page, (f) => f === null)) === true);
    // Save another setting through the same tab: the stored preference must survive.
    const headline = await editor.page.evaluateHandle(() => [...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith('Headline'))?.querySelector('input'));
    await headline.asElement().click({ clickCount: 3 });
    await headline.asElement().type('Pernikahan (fiktif)');
    // The stored language is already `en`, so wait for the headline itself to land before reading the language back.
    const save = await editor.page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => /^(Simpan|Save)$/.test(b.textContent.trim())));
    await save.asElement().click();
    let cover = null;
    for (let i = 0; i < 40 && cover?.headline !== 'Pernikahan (fiktif)'; i++) {
      await sleep(250);
      cover = JSON.parse(sql(`select coalesce(config->'theme'->'cover', '{}'::jsonb) from invitations where slug = '${slug}'`));
    }
    const language = settingsOf(slug).language;
    check('flag off: saving another field keeps settings.language = en', cover?.headline === 'Pernikahan (fiktif)' && language === 'en', `${JSON.stringify(cover)} ${language}`);
    await editor.context.close();
  }

  // ── E. Back to Indonesian on the family; the classic exception on the legacy layout ──────────────────────────
  {
    const { page, context } = await editorLanguage(ON, slug, 'user_s49_owner');
    await focusCheckedLanguage(page);
    await page.keyboard.press('ArrowLeft');
    check('editor: back to Indonesian stores an explicit id', await saveAndWait(page, slug, 'language', 'id'));
    await context.close();
    const guest = await open(`${ON}/i/${slug}/budi-hartono`);
    const body = await text(guest.page);
    // innerText applies the greeting label's `uppercase`; compare without case, like the English greeting.
    check('family back in Indonesian: lang=id and Indonesian words', (await docLang(guest.page)) === 'id' && body.includes('Konfirmasi Kehadiran') && /Kepada Yth\./i.test(body));
    check('family back in Indonesian: no lang attribute on the layout root', (await guest.page.evaluate(() => document.querySelector('main')?.hasAttribute('lang'))) === false);
    await guest.context.close();
  }
  {
    const legacy = 'review-legacy-full';
    const { page, context } = await editorLanguage(ON, legacy, 'user_s49_owner');
    const hint = await inLanguage(page, (f) => f?.querySelector('p')?.textContent ?? '');
    check('classic: the editor says the classic layout stays Indonesian', hint.includes('Tata letak klasik selalu tampil dalam Bahasa Indonesia'), hint);
    await focusCheckedLanguage(page);
    await page.keyboard.press('ArrowRight');
    check('classic: English can still be stored', await saveAndWait(page, legacy, 'language', 'en'));
    await context.close();
    for (const path of [`/i/${legacy}`, `/i/${legacy}/budi-hartono`, `/i/${legacy}/budi-hartono/pass`]) {
      const guest = await open(`${ON}${path}`);
      const body = await text(guest.page);
      check(`classic ${path.split('/').length > 3 ? path.split('/').slice(3).join('/') : 'shared'}: Indonesian with lang=id (D-041)`, (await docLang(guest.page)) === 'id' && !/Will You Attend\?|Guest QR pass|Dear\b/.test(body), await docLang(guest.page));
      if (!path.endsWith('/pass')) check(`classic ${path}: Open Graph locale id_ID`, (await meta(guest.page, 'og:locale')) === 'id_ID');
      await guest.context.close();
    }
  }

  // ── F. Another customer and a signed-out visitor never reach the editor ───────────────────────────────────────
  {
    const status = curl(['-o', '/dev/null', '-w', '%{http_code}', '-b', 'stub_user=user_s49_other', `${ON}/dashboard/invitations/${idOf(slug)}/edit`]);
    check('editor: another customer gets 404', status === '404', status);
    const out = curl(['-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', `${ON}/dashboard/invitations/${idOf(slug)}/edit`]);
    check('editor: signed out is sent to sign-in', /^30[27] .*\/sign-in/.test(out), out);
  }

  check('no console error on any page', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  writeFileSync('/vercel/share/work/s49-browser/results.json', JSON.stringify({ passed, total: results.length, results, consoleErrors, notes }, null, 2));
  for (const note of notes) console.log(`NOTE  ${note}`);
  console.log(`\n${passed} / ${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
