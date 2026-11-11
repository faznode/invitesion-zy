import { isAbsoluteUrl } from './image-url';

/**
 * B-029 (G-033): the hashtag a wedding host set for guests' posts (`instagramStory`), rendered once the host has switched
 * it on and filled it. Weddings only, like the editor, which hides this module for every other event type. The filter
 * link is offered only as an http(s) URL: the schema stores any absolute URL, and a guest page links nowhere else.
 */
export type ShareInvite = { tags: string[]; filterUrl?: string };

const MAX_TAGS = 5;

/** "#BudiSari, sari_budi" → ['#BudiSari', '#sari_budi']: one leading #, split on spaces or commas, no blanks or repeats. */
export function hashtagsOf(value: string | undefined): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const token of (value ?? '').split(/[\s,]+/)) {
    const tag = token.replace(/^#+/, '');
    // Hashtags are case-insensitive on the platforms guests post to, so "#BudiSari" and "#budisari" are one tag.
    const key = tag.toLocaleLowerCase('id-ID');
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(`#${tag}`);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
}

/** The value as a link target a guest page may offer: an http(s) URL, else nothing. */
export function httpLinkHref(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw || !isAbsoluteUrl(raw)) return undefined;
  const { protocol, href } = new URL(raw);
  return protocol === 'https:' || protocol === 'http:' ? href : undefined;
}

export function shareOf(input: { enabled?: boolean; hashtag?: string; filterUrl?: string } | undefined): ShareInvite | null {
  if (input?.enabled !== true) return null;
  const tags = hashtagsOf(input.hashtag);
  const filterUrl = httpLinkHref(input.filterUrl);
  return tags.length || filterUrl ? { tags, filterUrl } : null;
}
