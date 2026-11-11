import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

/** Dimensions from file headers, so a manifest's width/height claim is checked against the bytes. */
export type ImageInfo = { format: 'png' | 'jpeg' | 'webp' | 'svg' | 'unknown'; width?: number; height?: number };

export function imageInfo(buf: Buffer): ImageInfo {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) return { format: 'jpeg', height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      offset += 2 + buf.readUInt16BE(offset + 2);
    }
    return { format: 'jpeg' };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { format: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    return { format: 'webp' };
  }
  const head = buf.toString('utf8', 0, Math.min(buf.length, 1024));
  if (/<svg[\s>]/i.test(head)) {
    const width = head.match(/<svg[^>]*\bwidth="(\d+)"/i);
    const height = head.match(/<svg[^>]*\bheight="(\d+)"/i);
    return { format: 'svg', width: width ? Number(width[1]) : undefined, height: height ? Number(height[1]) : undefined };
  }
  return { format: 'unknown' };
}

export const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');
export const kib = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid single-colour RGB PNG (used by `new` for its placeholder OG image and by the self-tests). */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** WCAG 2.x relative luminance contrast ratio of two #rrggbb colours. */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}
