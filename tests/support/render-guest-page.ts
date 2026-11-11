/**
 * Renders the real guest page (the legacy layout or a B-030 design family) to static HTML, so behaviour tests assert on
 * what a guest receives instead of on the file where the code currently lives. No database and no Next.js server:
 * - `server-only` throws outside React's server condition. The guest page is a server component, so these renders are
 *   the server side; an empty module stands in for the guard.
 * - The Drizzle client is built at import time from POSTGRES_URL. postgres.js connects lazily and rendering never
 *   queries, so an unreachable placeholder is set only when the variable is missing; a stray query fails loudly.
 * The renderer is required lazily, after both stand-ins exist. `node --test` runs each test file in its own process, so
 * nothing here leaks into other files.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GuestPageProps } from '../../components/invitation/guest-view';
import type { Guest, Invitation } from '../../lib/db/schema';
import type { DetailConfig } from '../../lib/invitation/detail-config';
import { FAMILY_IDS, type FamilyId } from '../../lib/invitation/families';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;
process.env.POSTGRES_URL ??= 'postgres://render-test:unused@127.0.0.1:1/unused';

/** Every layout a stored invitation can render with: legacy (no family) first, then each registered family. */
export const LAYOUTS: readonly { label: string; familyId?: FamilyId }[] = [
  { label: 'legacy' },
  ...FAMILY_IDS.map((familyId) => ({ label: familyId, familyId })),
];

export function fixtureInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 1,
    userId: 1,
    templateId: null,
    slug: 'budi-sari',
    eventType: 'wedding',
    config: null,
    status: 'PUBLISHED',
    revisionCount: 0,
    publishedAt: new Date('2026-11-01T00:00:00Z'),
    expiresAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    creationKey: null,
    deletedAt: null,
    purgeAfter: null,
    purgedAt: null,
    workspaceId: null,
    clientLabel: null,
    guestPasscodeHash: null,
    guestPasscodeSetAt: null,
    ...overrides,
  };
}

export function fixtureGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 7,
    invitationId: 1,
    name: 'Budi Hartono',
    slug: 'budi-hartono',
    phone: null,
    category: null,
    qrCode: null,
    sentAt: null,
    openedAt: null,
    openedCount: 0,
    rsvpStatus: 'PENDING',
    guestCount: 2,
    attendingCount: null,
    rsvpEventAnswers: null,
    invitedEventIds: null,
    rsvpAnswers: null,
    checkedInAt: null,
    linkToken: null,
    importBatchId: null,
    passId: '0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

/** The config with `theme.familyId` set; a string outside FAMILY_IDS models a stored id whose family was retired. */
export function withFamily(config: DetailConfig, familyId?: string): DetailConfig {
  return { ...config, theme: { ...config.theme, familyId: familyId as FamilyId | undefined } };
}

export function renderGuestPage({
  config,
  invitation = fixtureInvitation(),
  guest = null,
  media = [],
  messages = [],
  readOnly = false,
  status = {},
  preview = false,
  giftWithheld,
  imageVariants,
  saveData,
  guestPassHref,
  readingLarge,
  memory,
}: Partial<GuestPageProps> & { config: DetailConfig }): string {
  const { PublicInvitationRenderer } = require('../../components/invitation/public-renderer') as typeof import('../../components/invitation/public-renderer');
  return renderToStaticMarkup(
    createElement(PublicInvitationRenderer, { config, invitation, guest, media, messages, readOnly, status, preview, giftWithheld, imageVariants, saveData, guestPassHref, readingLarge, memory }),
  );
}

/**
 * B-030: a family page without its `data-section` markers (the manifest's section ids on each section's root). The
 * markers are the section contract's only markup change, so digests pinned before B-030 compare the page without them.
 */
export const withoutSectionMarkers = (html: string) => html.replace(/ data-section="[a-z]+"/g, '');

const SHARE_GROUP = '<div role="group" aria-label="[^"]+" class="flex flex-col gap-3 [^"]+">(?:(?!<div role="group").)*?</p></div>';
/**
 * G-035: a family page without its footer's share actions (with the spacing wrapper Kartu, Riang and Lontar give them).
 * They are the only other markup added since the digests above were pinned; `g035-invite-share` proves that a page with
 * guest sharing off equals the default page through this, so the rollback is byte-exact.
 */
export const withoutShareActions = (html: string) => html.replace(new RegExp(`<div class="mb-6">${SHARE_GROUP}</div>|${SHARE_GROUP}`, 'gs'), '');

/**
 * G-036: a family page without the cover's large-text switch (its server markup is an empty 44 px row; the button arrives
 * with hydration) and without the `<main>` reading state. They are the only markup G-036 adds; `g036-reading-mode` proves
 * that a page with guest reading off, or the legacy layout, equals the default page through this (byte-exact rollback).
 */
export const withoutReadingToggle = (html: string) => html.replace(/<div data-reading-toggle="" class="[^"]*"><\/div>| data-reading="large"/g, '');

/**
 * G-029: a family page without the map facade's server markup (an empty row after the static location link; the button
 * arrives with hydration and the frame only after a tap). `g029-map-facade` proves that the flag off equals the default
 * page through this, so the rollback is byte-exact.
 */
export const withoutMapFacade = (html: string) => html.replace(/<div data-map-facade="" class="mt-3 w-full"><\/div>/g, '');

const unescapeAttribute = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

/** Values of the hidden inputs with this name, in document order (what every form on the page posts). */
export function hiddenInputValues(html: string, name: string): string[] {
  return [...html.matchAll(/<input\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => /\btype="hidden"/.test(tag) && tag.includes(` name="${name}"`))
    .map((tag) => unescapeAttribute(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? ''));
}

export function linkHrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) => unescapeAttribute(match[1]));
}

export const formCount = (html: string) => html.match(/<form\b/g)?.length ?? 0;
