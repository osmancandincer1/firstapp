import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  checkPhotoFile,
  CorruptFile,
  mp4DurationMs,
  PHOTO_MAX_BYTES,
  processJpeg,
  processPng,
  sniff,
} from '../_shared/media.ts';

const enc = new TextEncoder();
const bytes = (...parts: (number[] | string | Uint8Array)[]) => {
  const arrs = parts.map((p) =>
    typeof p === 'string' ? enc.encode(p) : p instanceof Uint8Array ? p : new Uint8Array(p),
  );
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
};
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const seg = (marker: number, payload: Uint8Array | string) => {
  const p = typeof payload === 'string' ? enc.encode(payload) : payload;
  return bytes([0xff, marker, ...be16(p.length + 2)], p);
};
const contains = (hay: Uint8Array, needle: string) =>
  new TextDecoder('latin1').decode(hay).includes(needle);

/** A structurally valid JPEG with EXIF (incl. GPS), XMP, a comment and an ICC profile. */
function jpeg(width: number, height: number) {
  return bytes(
    [0xff, 0xd8],
    seg(0xe0, bytes('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    seg(0xe1, 'Exif\0\0 GPSLatitude 41.0082 GPSLongitude 28.9784 Canon EOS'),
    seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>creator</x:xmpmeta>'),
    seg(0xe2, 'ICC_PROFILE\0\x01\x01profile-bytes'),
    seg(0xed, 'Photoshop 3.0 IPTC city'),
    seg(0xfe, 'secret comment'),
    seg(0xc0, bytes([8], be16(height), be16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])),
    seg(0xda, bytes([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])),
    'PIXELDATA',
    [0xff, 0xd9],
  );
}

Deno.test('sniff recognizes JPEG, PNG, HEIC, WebP and MP4', () => {
  assertEquals(sniff(jpeg(10, 10)), 'jpeg');
  assertEquals(sniff(bytes([0x89], 'PNG\r\n\x1a\n')), 'png');
  assertEquals(sniff(bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0])), 'heic');
  assertEquals(sniff(bytes('RIFF', [0, 0, 0, 0], 'WEBP')), 'webp');
  assertEquals(sniff(bytes([0, 0, 0, 24], 'ftypM4A ', [0, 0, 0, 0])), 'mp4');
  assertEquals(sniff(enc.encode('GIF89a')), null);
});

Deno.test(
  'PRO-02: JPEG metadata (EXIF, GPS, XMP, IPTC, comments) is removed, pixels and colour kept',
  () => {
    const src = jpeg(1200, 1600);
    assert(contains(src, 'GPSLatitude'));
    const { width, height, clean } = processJpeg(src);
    assertEquals([width, height], [1200, 1600]);
    for (const leak of ['Exif', 'GPSLatitude', 'Canon', 'xmpmeta', 'IPTC', 'secret comment']) {
      assert(!contains(clean, leak), `${leak} must be gone`);
    }
    for (const kept of ['JFIF', 'ICC_PROFILE', 'PIXELDATA'])
      assert(contains(clean, kept), `${kept} must stay`);
    assertEquals(Array.from(clean.subarray(-2)), [0xff, 0xd9]);
  },
);

Deno.test('broken JPEGs are reported as corrupt', () => {
  const good = jpeg(1200, 1600);
  assertThrows(() => processJpeg(good.subarray(0, 30)), CorruptFile);
  assertThrows(
    () => processJpeg(bytes([0xff, 0xd8], seg(0xe0, 'JFIF\0'), [0xff, 0xd9])),
    CorruptFile,
  );
  assertThrows(() => processJpeg(bytes([0xff, 0xd8, 0x00, 0x00])), CorruptFile);
});

function pngChunk(type: string, data: Uint8Array | string) {
  const d = typeof data === 'string' ? enc.encode(data) : data;
  return bytes(be32(d.length), type, d, [0, 0, 0, 0]);
}
function png(width: number, height: number) {
  return bytes(
    [0x89],
    'PNG\r\n\x1a\n',
    pngChunk('IHDR', bytes(be32(width), be32(height), [8, 6, 0, 0, 0])),
    pngChunk('tEXt', 'Comment\0taken at home'),
    pngChunk('eXIf', 'GPS'),
    pngChunk('IDAT', 'PIXELS'),
    pngChunk('IEND', ''),
  );
}

Deno.test('PRO-02: PNG text and EXIF chunks are removed', () => {
  const { width, height, clean } = processPng(png(900, 1200));
  assertEquals([width, height], [900, 1200]);
  assert(!contains(clean, 'taken at home') && !contains(clean, 'eXIf'));
  assert(contains(clean, 'PIXELS') && contains(clean, 'IEND'));
  assertThrows(() => processPng(png(900, 1200).subarray(0, 40)), CorruptFile);
});

Deno.test('PRO-03: type, size and resolution limits', () => {
  const ok = checkPhotoFile(jpeg(1200, 900));
  assert(ok.ok && ok.type === 'jpeg' && ok.width === 1200);
  assertEquals(checkPhotoFile(png(900, 1200)).ok, true);
  assertEquals(checkPhotoFile(jpeg(640, 480)), { ok: false, reason: 'too_small' });
  assertEquals(checkPhotoFile(bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0])), {
    ok: false,
    reason: 'unsupported_type',
  });
  assertEquals(checkPhotoFile(enc.encode('not an image at all')), {
    ok: false,
    reason: 'unsupported_type',
  });
  assertEquals(checkPhotoFile(jpeg(1200, 900).subarray(0, 40)), { ok: false, reason: 'corrupt' });
  assertEquals(checkPhotoFile(new Uint8Array(PHOTO_MAX_BYTES + 1)), {
    ok: false,
    reason: 'too_large',
  });
});

function box(type: string, payload: Uint8Array) {
  return bytes(be32(payload.length + 8), type, payload);
}
function m4a(durationMs: number, version: 0 | 1 = 0) {
  const timescale = 44100;
  const duration = Math.round((durationMs / 1000) * timescale);
  const mvhd =
    version === 0
      ? bytes([0, 0, 0, 0], be32(0), be32(0), be32(timescale), be32(duration), new Uint8Array(80))
      : bytes(
          [1, 0, 0, 0],
          be32(0),
          be32(0),
          be32(0),
          be32(0),
          be32(timescale),
          be32(0),
          be32(duration),
          new Uint8Array(80),
        );
  return bytes(
    box('ftyp', bytes('M4A ', be32(0), 'isom')),
    box('moov', box('mvhd', mvhd)),
    box('mdat', enc.encode('audio')),
  );
}

Deno.test('voice card duration is read from the MP4 header (v0 and v1)', () => {
  assertEquals(mp4DurationMs(m4a(12_000)), 12_000);
  assertEquals(mp4DurationMs(m4a(4_200, 1)), 4_200);
  assertEquals(
    mp4DurationMs(bytes(box('ftyp', bytes('M4A ', be32(0))), box('mdat', enc.encode('x')))),
    null,
  );
  assertEquals(mp4DurationMs(jpeg(10, 10)), null);
});
