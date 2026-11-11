/**
 * B-024 (I-27): the browser twin of `passLookupKey` (`guest-pass.ts`), so the scanner can name a guest while offline
 * from the one-way keys its page holds. Web Crypto only; the tests compare it with the server's key for the same pass.
 */

const PREFIX = 'IVP1.';
const TOKEN_LENGTH = PREFIX.length + 48;
const BODY = /^[A-Za-z0-9_-]{48}$/;
const LOOKUP_LABEL = 'invitesion.pass-lookup.v1|';

/** Looks like a guest pass (prefix, length, alphabet); only the server can tell whether it is genuine. */
export function looksLikePass(text: string): boolean {
  return text.length === TOKEN_LENGTH && text.startsWith(PREFIX) && BODY.test(text.slice(PREFIX.length));
}

function base64UrlToBytes(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function passLookupKeyInBrowser(token: string): Promise<string | null> {
  if (!looksLikePass(token)) return null;
  const passId = Array.from(base64UrlToBytes(token.slice(PREFIX.length)).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(LOOKUP_LABEL + passId));
  return bytesToBase64Url(new Uint8Array(digest)).slice(0, 22);
}
