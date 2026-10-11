/**
 * Byte-level media checks (APP.md §6.4, §7.2, PRO-02, PRO-03, §6.4 ses kartı).
 *
 * Images are never decoded here (Edge Functions have a small CPU budget):
 * the container structure is read to get the type and size, and metadata
 * segments are dropped. Pixels stay untouched. The app already re-encodes
 * photos to JPEG before upload; this is the server-side guarantee that no
 * EXIF/GPS data is ever published.
 */

export type ImageType = 'jpeg' | 'png';
export type SniffedType = ImageType | 'heic' | 'webp' | 'mp4' | null;

const ascii = (b: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...b.subarray(start, start + len));
const u16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32 = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;

export function sniff(b: Uint8Array): SniffedType {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && ascii(b, 1, 3) === 'PNG' && b[0] === 0x89) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1', 'hevc'].includes(brand)) return 'heic';
    return 'mp4';
  }
  return null;
}

export class CorruptFile extends Error {}

/** Markers with no length field. */
const STANDALONE = new Set([0xd8, 0xd9, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
/** Start-of-frame markers carrying the image size (all SOFn except DHT, JPG, DAC). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function keepJpegSegment(marker: number, b: Uint8Array, start: number, len: number): boolean {
  if (marker === 0xfe) return false; // comment
  if (marker === 0xe0) return true; // JFIF
  if (marker === 0xe2) return ascii(b, start + 4, 12) === 'ICC_PROFILE\0'; // colour profile only
  if (marker === 0xee) return ascii(b, start + 4, 5) === 'Adobe'; // colour transform flag
  if (marker >= 0xe1 && marker <= 0xef) return false; // EXIF, XMP, IPTC, maker notes…
  return len >= 2;
}

/** Returns the size and a copy without metadata segments. Throws CorruptFile. */
export function processJpeg(b: Uint8Array): { width: number; height: number; clean: Uint8Array } {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new CorruptFile('expected a marker');
    while (b[i] === 0xff) i++; // fill bytes
    const marker = b[i]!;
    const start = i - 1;
    i++;
    if (marker === 0xd9) {
      out.push(b.subarray(start, i));
      break;
    }
    if (STANDALONE.has(marker)) {
      out.push(b.subarray(start, i));
      continue;
    }
    if (i + 2 > b.length) throw new CorruptFile('truncated segment');
    const len = u16(b, i);
    if (len < 2 || i + len > b.length) throw new CorruptFile('bad segment length');
    if (SOF.has(marker)) {
      height = u16(b, i + 3);
      width = u16(b, i + 5);
    }
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded image data; copy it unchanged.
      out.push(b.subarray(start));
      i = b.length;
      break;
    }
    if (keepJpegSegment(marker, b, start, len)) out.push(b.subarray(start, i + len));
    i += len;
  }
  if (!width || !height) throw new CorruptFile('no frame header');
  return { width, height, clean: concat(out) };
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

export function processPng(b: Uint8Array): { width: number; height: number; clean: Uint8Array } {
  if (b.length < 33 || ascii(b, 12, 4) !== 'IHDR') throw new CorruptFile('missing IHDR');
  const width = u32(b, 16);
  const height = u32(b, 20);
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let ended = false;
  while (i + 12 <= b.length) {
    const len = u32(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) throw new CorruptFile('truncated chunk');
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || !width || !height) throw new CorruptFile('incomplete PNG');
  return { width, height, clean: concat(out) };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_MIN_SHORT_SIDE = 800;

export type PhotoFileCheck =
  | { ok: true; type: ImageType; width: number; height: number; clean: Uint8Array }
  | { ok: false; reason: 'too_large' | 'unsupported_type' | 'corrupt' | 'too_small' };

/** §6.4: JPEG/PNG (HEIC is converted by the app), at most 15 MB, short side at least 800 px. */
export function checkPhotoFile(b: Uint8Array): PhotoFileCheck {
  if (b.length > PHOTO_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const type = sniff(b);
  if (type !== 'jpeg' && type !== 'png') return { ok: false, reason: 'unsupported_type' };
  try {
    const r = type === 'jpeg' ? processJpeg(b) : processPng(b);
    if (Math.min(r.width, r.height) < PHOTO_MIN_SHORT_SIDE)
      return { ok: false, reason: 'too_small' };
    return { ok: true, type, ...r };
  } catch (e) {
    if (e instanceof CorruptFile) return { ok: false, reason: 'corrupt' };
    throw e;
  }
}

/** Duration of an MP4/M4A file from its movie header (moov/mvhd), in milliseconds. */
export function mp4DurationMs(b: Uint8Array): number | null {
  if (sniff(b) !== 'mp4') return null;
  const findBox = (start: number, end: number, type: string): [number, number] | null => {
    let i = start;
    while (i + 8 <= end) {
      let size = u32(b, i);
      let header = 8;
      if (size === 1) {
        if (i + 16 > end) return null;
        size = u32(b, i + 8) * 2 ** 32 + u32(b, i + 12);
        header = 16;
      } else if (size === 0) {
        size = end - i;
      }
      if (size < header || i + size > end) return null;
      if (ascii(b, i + 4, 4) === type) return [i + header, i + size];
      i += size;
    }
    return null;
  };
  const moov = findBox(0, b.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(moov[0], moov[1], 'mvhd');
  if (!mvhd) return null;
  const [s] = mvhd;
  const version = b[s]!;
  const timescale = version === 1 ? u32(b, s + 20) : u32(b, s + 12);
  const duration = version === 1 ? u32(b, s + 24) * 2 ** 32 + u32(b, s + 28) : u32(b, s + 16);
  if (!timescale) return null;
  return Math.round((duration / timescale) * 1000);
}
