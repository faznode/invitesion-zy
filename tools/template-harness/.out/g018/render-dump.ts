// Scratch (git-ignored): render the same stored configs through one tree's real guest-page renderer at a fixed clock.
//   fixtures: cd <project> && npx tsx tools/template-harness/.out/g018/render-dump.ts fixtures <out.json>
//   render:   cd <tree> && ROOT=<tree> LANGS=unset,id,en npx tsx <project>/tools/template-harness/.out/g018/render-dump.ts render <fixtures.json> <out.json>
// The clock is frozen before the renderer loads, so countdowns and "ahead" checks agree across trees.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FIXED_NOW = Date.parse('2026-11-11T06:00:00Z');
const [mode, input, output] = process.argv.slice(2);

if (mode === 'fixtures') {
  const { familyReviewInvitations } = require('../../../../invitation-research/_tools/setup/seed-family-review');
  const rows = familyReviewInvitations({
    ceremony: true,
    questions: true,
    portraits: true,
    programme: true,
    musicUrl: 'https://audio.example.com/tone.mp3',
    newInvitations: true,
    profiles: true,
    gallery: true,
    markVariants: true,
    logoUrl: '/media/1/b029b029b029b029b029b029.png',
    choices: true,
  });
  writeFileSync(input, JSON.stringify(rows.map((row: any) => ({ slug: row.slug, eventType: row.eventType, expired: row.expired, config: row.config }))));
  console.log(`fixtures: ${rows.length} rows -> ${input}`);
} else if (mode === 'render') {
  Date.now = () => FIXED_NOW;
  const root = process.env.ROOT!;
  const support = require(`${root}/tests/support/render-guest-page`);
  const rows = JSON.parse(readFileSync(input, 'utf8')) as { slug: string; eventType: string; expired: boolean; config: any }[];
  const langs = (process.env.LANGS ?? 'unset').split(',');
  const messages = [{ id: 1, name: 'Rina Contoh', message: 'Selamat menempuh hidup baru', createdAt: new Date('2026-11-01T10:00:00Z'), hostReply: 'Terima kasih Rina' }];
  const out: Record<string, string> = {};
  for (const row of rows) {
    const invitation = support.fixtureInvitation({ slug: row.slug, eventType: row.eventType });
    for (const lang of langs) {
      const config = lang === 'unset' ? row.config : { ...row.config, settings: { ...row.config.settings, language: lang } };
      for (const audience of ['personal', 'link'] as const) {
        const html = support.renderGuestPage({
          config,
          invitation,
          guest: audience === 'personal' ? support.fixtureGuest() : null,
          messages,
          readOnly: row.expired,
          guestPassHref: audience === 'personal' ? `/i/${row.slug}/budi-hartono/pass` : null,
        });
        out[`${row.slug}|${lang}|${audience}`] = html;
      }
    }
  }
  writeFileSync(output, JSON.stringify(out));
  const digest = createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 12);
  console.log(`render: ${Object.keys(out).length} pages from ${root} (langs ${langs.join('/')}, flag ${process.env.FLAG_GUEST_LANGUAGE ?? 'default'}) digest ${digest}`);
} else {
  console.error('usage: fixtures <out> | render <fixtures> <out>');
  process.exit(2);
}
