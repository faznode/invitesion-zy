/**
 * QRIS (EMVCo merchant-presented QR) payload handling.
 *
 * A merchant's static QRIS string encodes everything except the amount: the
 * payer types it in. Injecting the amount converts it into a *dynamic* QR, which
 * removes the single most common cause of failed reconciliation — a customer
 * paying Rp14.900 for a Rp149.000 invitation and both sides believing it settled.
 *
 * The format is EMVCo TLV: two-digit tag, two-digit length, then that many
 * characters of value. Tag 63 is a CRC-16 over the entire payload including its
 * own tag and length, so any edit invalidates it and it must be recomputed last.
 *
 * Pure and dependency-free, so the CRC and the amount injection are testable
 * without a payment provider.
 */

export class QrisPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrisPayloadError';
  }
}

export type Tlv = { tag: string; value: string };

const TAG_POINT_OF_INITIATION = '01';
const TAG_TRANSACTION_AMOUNT = '54';
const TAG_CRC = '63';

const POI_STATIC = '11';
const POI_DYNAMIC = '12';

/** Parses a payload into ordered TLV entries. */
export function parseTlv(payload: string): Tlv[] {
  const entries: Tlv[] = [];
  let cursor = 0;

  while (cursor < payload.length) {
    if (cursor + 4 > payload.length) {
      throw new QrisPayloadError(`Truncated TLV header at offset ${cursor}`);
    }
    const tag = payload.slice(cursor, cursor + 2);
    const lengthText = payload.slice(cursor + 2, cursor + 4);
    const length = Number(lengthText);

    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      throw new QrisPayloadError(`Non-numeric TLV header "${tag}${lengthText}" at offset ${cursor}`);
    }
    const start = cursor + 4;
    const end = start + length;
    if (end > payload.length) {
      throw new QrisPayloadError(`TLV ${tag} claims ${length} chars but only ${payload.length - start} remain`);
    }

    entries.push({ tag, value: payload.slice(start, end) });
    cursor = end;
  }

  if (entries.length === 0) throw new QrisPayloadError('Payload contains no TLV entries');
  return entries;
}

/** Serialises TLV entries back into a payload string. */
export function serialiseTlv(entries: Tlv[]): string {
  return entries
    .map(({ tag, value }) => {
      if (value.length > 99) {
        throw new QrisPayloadError(`TLV ${tag} value is ${value.length} chars; the format caps length at 99`);
      }
      return `${tag}${String(value.length).padStart(2, '0')}${value}`;
    })
    .join('');
}

/**
 * CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF, no input or
 * output reflection, no final XOR. This is the variant QRIS specifies; the other
 * common CRC-16 variants produce a different, silently-rejected checksum.
 */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Verifies the CRC of a complete payload. */
export function verifyChecksum(payload: string): boolean {
  const marker = payload.lastIndexOf(`${TAG_CRC}04`);
  if (marker === -1 || marker + 8 !== payload.length) return false;
  const body = payload.slice(0, marker + 4);
  const provided = payload.slice(marker + 4).toUpperCase();
  return crc16(body) === provided;
}

/**
 * Formats an IDR amount for tag 54.
 *
 * QRIS carries the amount as a plain decimal string with no grouping. We hold
 * IDR in whole rupiah, and a fractional rupiah is not payable, so a non-integer
 * is a programming error rather than something to round away.
 */
export function formatQrisAmount(amountInRupiah: number): string {
  if (!Number.isInteger(amountInRupiah) || amountInRupiah <= 0) {
    throw new QrisPayloadError(`QRIS amount must be a positive whole rupiah value, got ${amountInRupiah}`);
  }
  return String(amountInRupiah);
}

/**
 * Turns a static merchant QRIS into a dynamic one for a specific amount.
 *
 * Steps, in the order the format requires:
 *  1. verify the source checksum, so a mistyped merchant string fails here
 *     rather than at the customer's banking app;
 *  2. flip tag 01 from static to dynamic;
 *  3. set tag 54 to the amount, inserted in ascending tag order;
 *  4. drop the old CRC and recompute it over the new payload.
 */
export function withAmount(staticPayload: string, amountInRupiah: number): string {
  const trimmed = staticPayload.trim();
  if (!trimmed) throw new QrisPayloadError('Static QRIS payload is empty');
  if (!verifyChecksum(trimmed)) {
    throw new QrisPayloadError('Static QRIS payload checksum is invalid — check it was copied in full');
  }

  const entries = parseTlv(trimmed).filter((entry) => entry.tag !== TAG_CRC);

  const poi = entries.find((entry) => entry.tag === TAG_POINT_OF_INITIATION);
  if (poi) {
    poi.value = POI_DYNAMIC;
  } else {
    entries.unshift({ tag: TAG_POINT_OF_INITIATION, value: POI_DYNAMIC });
  }

  const amount = formatQrisAmount(amountInRupiah);
  const existingAmount = entries.find((entry) => entry.tag === TAG_TRANSACTION_AMOUNT);
  if (existingAmount) {
    existingAmount.value = amount;
  } else {
    // Tags are ordered ascending; place 54 before the first larger tag.
    const index = entries.findIndex((entry) => entry.tag > TAG_TRANSACTION_AMOUNT);
    const entry = { tag: TAG_TRANSACTION_AMOUNT, value: amount };
    if (index === -1) entries.push(entry);
    else entries.splice(index, 0, entry);
  }

  const body = `${serialiseTlv(entries)}${TAG_CRC}04`;
  return `${body}${crc16(body)}`;
}

/** True when the payload is a static (amount-less) merchant QR. */
export function isStaticPayload(payload: string): boolean {
  try {
    const poi = parseTlv(payload.trim()).find((entry) => entry.tag === TAG_POINT_OF_INITIATION);
    return poi?.value === POI_STATIC;
  } catch {
    return false;
  }
}
