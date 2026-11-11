// Scratch probe (git-ignored, not product code): renders every family review fixture in Indonesian and English and lists
// the visible text and accessible labels that stay identical across the two renders and are not host-written content.
// Run from the project root: npx tsx tools/template-harness/.out/g018/probe.ts
import { fixtureGuest, fixtureInvitation, renderGuestPage } from '../../../../tests/support/render-guest-page';
import { familyReviewInvitations } from '../../../../invitation-research/_tools/setup/seed-family-review';
import type { DetailConfig } from '../../../../lib/invitation/detail-config';

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
}).filter((row) => row.config.theme?.familyId);

const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

function texts(html: string): string[] {
  const out: string[] = [];
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const match of body.matchAll(/\b(aria-label|alt|title|placeholder|aria-roledescription|aria-valuetext)="([^"]*)"/g)) out.push(decode(match[2]));
  for (const match of body.replace(/<[^>]+>/g, '\n').split('\n')) {
    const text = decode(match).trim();
    if (text) out.push(text);
  }
  return out.filter((text) => /\p{L}{2,}/u.test(text));
}

const withLanguage = (config: DetailConfig, language: 'id' | 'en'): DetailConfig => ({ ...config, settings: { ...config.settings, language } });
const messages = [
  { id: 1, name: 'Rina Contoh', message: 'Selamat menempuh hidup baru', createdAt: new Date('2026-11-01T10:00:00Z'), hostReply: 'Terima kasih Rina' },
];
const STATUSES: Record<string, string>[] = [
  {},
  { rsvp: 'saved' },
  { rsvp: 'invalid' },
  { rsvp: 'closed' },
  { rsvp: 'busy', rsvpr: '120' },
  { rsvp: 'retry', rsvpk: 'k' },
  { rsvp: 'answers', rsvpq: 'q1' },
  { rsvp: 'events', rsvpe: 'ev1' },
  { rsvp: 'deadline' },
  { rsvp: 'personal' },
  { rsvp: 'off' },
  { wish: 'saved' },
  { wish: 'pending' },
  { wish: 'delivered' },
  { wish: 'invalid' },
  { wish: 'busy', wishr: '60' },
  { wish: 'retry', wishk: 'k' },
  { wish: 'closed' },
  { wish: 'off' },
];

const SAME_IN_BOTH = new Set(['RSVP', 'Dress code', 'Seminar', 'Gala / Award', 'Gathering', 'Webinar', 'Video', 'WIB', 'WITA', 'WIT', 'QRIS']);
const leaks = new Map<string, Set<string>>();
let pages = 0;
for (const row of rows) {
  const invitation = fixtureInvitation({ slug: row.slug, eventType: row.eventType });
  const host = new Set(strings(row.config).map((s) => s.trim()).filter(Boolean));
  for (const m of messages) [m.name, m.message, m.hostReply].forEach((s) => host.add(s));
  const guest = fixtureGuest({ name: 'Budi Hartono' });
  host.add(guest.name);
  for (const withGuest of [true, false]) {
    for (const status of withGuest ? STATUSES : [{}]) {
      const render = (language: 'id' | 'en') =>
        renderGuestPage({
          config: withLanguage(row.config, language),
          invitation,
          guest: withGuest ? guest : null,
          messages,
          readOnly: row.expired,
          status,
          guestPassHref: withGuest ? `/i/${row.slug}/budi-hartono/pass` : null,
        });
      const id = new Set(texts(render('id')));
      const en = texts(render('en'));
      pages += 2;
      for (const text of en) {
        if (!id.has(text)) continue;
        if (host.has(text) || SAME_IN_BOTH.has(text) || /^(?:\d{1,2} )?[A-Z][a-z]{2}(?: \d{4})?$/.test(text)) continue;
        const key = text.length > 140 ? `${text.slice(0, 140)}…` : text;
        if (!leaks.has(key)) leaks.set(key, new Set());
        leaks.get(key)!.add(`${row.slug}${withGuest ? '+guest' : ''}${Object.keys(status).length ? ` ${JSON.stringify(status)}` : ''}`);
      }
    }
  }
}

console.log(`rows ${rows.length}, pages rendered ${pages}`);
const sorted = [...leaks.entries()].sort((a, b) => b[1].size - a[1].size);
for (const [text, where] of sorted) console.log(`${String(where.size).padStart(4)}  ${JSON.stringify(text)}  e.g. ${[...where][0]}`);
