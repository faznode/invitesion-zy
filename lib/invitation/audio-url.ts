import { isAbsoluteUrl } from './image-url';

/**
 * B-009 (D-045): the background music a guest page may request. Uploads accept images only (`ALLOWED_IMAGE_EXT`), so a
 * host's music is an absolute URL typed into the editor, under the rule images follow (`safeImageSrc`): http(s) only.
 * Any other scheme `new URL()` parses (`javascript:`, `data:`, `blob:`, `file:`) renders no audio. The page sets
 * `preload="none"`, so nothing is fetched from that host until the guest taps.
 */
export function safeAudioSrc(value?: string): string | undefined {
  if (!value || !isAbsoluteUrl(value)) return undefined;
  const { protocol, href } = new URL(value);
  return protocol === 'https:' || protocol === 'http:' ? href : undefined;
}
