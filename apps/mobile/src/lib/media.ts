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

// --- Cropping (§6.4 "kırpılabilir") ----------------------------------------------------

/** Profile photos are shown in a 4:5 portrait frame. */
export const PHOTO_ASPECT = 4 / 5;
/** Width / height range that already looks right in the frame (9:16 up to square). */
const ASPECT_MIN = 9 / 16;
const ASPECT_MAX = 1;

/** True when a photo would lose too much in the 4:5 frame (landscape, panorama, very tall). */
export function needsCrop(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio < ASPECT_MIN || ratio > ASPECT_MAX;
}

export function isTooSmall(width: number, height: number): boolean {
  return width > 0 && height > 0 && Math.min(width, height) < MIN_SHORT_SIDE;
}

export interface CropView {
  /** Image size in pixels. */
  width: number;
  height: number;
  /** Frame size on screen (4:5). */
  frameWidth: number;
  frameHeight: number;
}

/** Scale at zoom 1: the image just covers the frame. */
export function coverScale(v: CropView): number {
  return Math.max(v.frameWidth / v.width, v.frameHeight / v.height);
}

/**
 * Largest zoom that still leaves a crop at least MIN_SHORT_SIDE wide (the
 * short side of a 4:5 crop is its width). Never below 1.
 */
export function maxZoom(v: CropView): number {
  const cropWidthAt1 = v.frameWidth / coverScale(v);
  return Math.max(1, cropWidthAt1 / MIN_SHORT_SIDE);
}

/** Keeps the image covering the frame: offsets are ≤ 0 and the far edge stays outside. */
export function clampOffset(v: CropView, zoom: number, x: number, y: number) {
  const s = coverScale(v) * zoom;
  const minX = Math.min(0, v.frameWidth - v.width * s);
  const minY = Math.min(0, v.frameHeight - v.height * s);
  return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
}

/** Offset that centres the image in the frame. */
export function centredOffset(v: CropView, zoom: number) {
  const s = coverScale(v) * zoom;
  return { x: (v.frameWidth - v.width * s) / 2, y: (v.frameHeight - v.height * s) / 2 };
}

/** The part of the image (in pixels) visible in the frame. */
export function cropRect(v: CropView, zoom: number, offset: { x: number; y: number }) {
  const s = coverScale(v) * zoom;
  const { x, y } = clampOffset(v, zoom, offset.x, offset.y);
  const width = Math.min(v.width, Math.round(v.frameWidth / s));
  const height = Math.min(v.height, Math.round(v.frameHeight / s));
  return {
    originX: Math.max(0, Math.min(v.width - width, Math.round(-x / s))),
    originY: Math.max(0, Math.min(v.height - height, Math.round(-y / s))),
    width,
    height,
  };
}

/** Crops a picked photo; the result is uploaded like any other photo. */
export async function cropImage(
  uri: string,
  rect: { originX: number; originY: number; width: number; height: number },
): Promise<{ uri: string; width: number; height: number }> {
  const rendered = await ImageManipulator.manipulate(uri).crop(rect).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
