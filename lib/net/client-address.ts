import { isIP } from 'node:net';

/**
 * The guest's public address for the per-address write limit (B-013), by the trusted-proxy contract (R-03, D-043).
 *
 * `X-Forwarded-For` is a list every proxy appends to, so only the entries written by proxies this deployment trusts are
 * facts; everything to their left came from the client and can say anything. With `hops` trusted proxies in front of
 * Next.js, the client's address is the entry `hops` places from the right. Vercel's edge, the deployment this project
 * targets, replaces the header with exactly one entry (the client's address), which the default of one hop reads.
 * `TRUSTED_PROXY_HOPS=0` trusts no header at all.
 *
 * The result is null whenever the header cannot answer by this contract: missing, shorter than the hop count, or not an
 * IP literal. That only drops the per-address limit for the request; the per-link limit still applies. The address goes
 * to the API, which keeps a keyed hash of it, and is never stored or logged on this side.
 */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const MAX_TRUSTED_PROXY_HOPS = 10;

/** `TRUSTED_PROXY_HOPS`: 0–10; unset means the default, and an unreadable value trusts nothing (0). */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return DEFAULT_TRUSTED_PROXY_HOPS;
  if (!/^\d{1,2}$/.test(raw)) return 0;
  const hops = Number(raw);
  return hops <= MAX_TRUSTED_PROXY_HOPS ? hops : 0;
}

/** One list entry as an IP literal: brackets and a port (`[v6]:port`, `v4:port`) removed; IPv6 zone ids refused. */
function addressFromEntry(entry: string): string | null {
  let value = entry.trim();
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(value);
  if (bracketed) value = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(value)) value = value.slice(0, value.lastIndexOf(':'));
  if (value.includes('%')) return null;
  return isIP(value) ? value.toLowerCase() : null;
}

export function clientAddressFrom(forwardedFor: string | null | undefined, hops: number): string | null {
  if (!forwardedFor || hops < 1) return null;
  const entries = forwardedFor.split(',');
  if (entries.length < hops) return null;
  return addressFromEntry(entries[entries.length - hops]);
}
