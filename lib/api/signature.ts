import { createHash, createHmac } from 'node:crypto';

/**
 * Internal service signature (masterplan 09 §8.5): the TypeScript half of `services/api/src/service_auth.rs`. Both
 * run `contracts/vectors/service-signature.json`, whose expected headers come from an independent implementation.
 *
 * header = `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<METHOD>.<path and query>.<hex SHA-256 of the body>")>`
 */
export const SIGNATURE_HEADER = 'x-invitesion-signature';

export function canonicalMessage(timestamp: number, method: string, pathAndQuery: string, body: string): string {
  return `${timestamp}.${method}.${pathAndQuery}.${createHash('sha256').update(body, 'utf8').digest('hex')}`;
}

export function signServiceRequest(secret: string, timestamp: number, method: string, pathAndQuery: string, body: string): string {
  const mac = createHmac('sha256', secret).update(canonicalMessage(timestamp, method, pathAndQuery, body), 'utf8').digest('hex');
  return `t=${timestamp},v1=${mac}`;
}
