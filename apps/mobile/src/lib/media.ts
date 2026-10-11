import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Server rules (§6.4): short side at least 800 px; we send at most 2048 px on the long side. */
export const MIN_SHORT_SIDE = 800;
export const MAX_LONG_SIDE = 2048;

export type PreparedImage =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: 'too_small' };

/** Target size keeping the aspect ratio; never upscales. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= MAX_LONG_SIDE) return { width, height };
  const k = MAX_LONG_SIDE / long;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/**
 * Re-encodes a picked photo as JPEG (HEIC included) at a sane size. Re-encoding
 * also drops the original EXIF/GPS block; the server strips metadata again (PRO-02).
 */
export async function prepareImage(
  uri: string,
  width: number,
  height: number,
): Promise<PreparedImage> {
  if (width > 0 && height > 0 && Math.min(width, height) < MIN_SHORT_SIDE)
    return { ok: false, reason: 'too_small' };
  const size = targetSize(width, height);
  const context = ImageManipulator.manipulate(uri);
  if (size.width !== width) context.resize({ width: size.width, height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  if (Math.min(saved.width, saved.height) < MIN_SHORT_SIDE)
    return { ok: false, reason: 'too_small' };
  return {
    ok: true,
    bytes: await new File(saved.uri).bytes(),
    width: saved.width,
    height: saved.height,
  };
}

export function readBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
