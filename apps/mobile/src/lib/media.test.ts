import {
  centredOffset,
  clampOffset,
  coverScale,
  cropImage,
  cropRect,
  isTooSmall,
  maxZoom,
  needsCrop,
  prepareImage,
  targetSize,
  type CropView,
} from './media';

const mockCrop = jest.fn();
const mockResize = jest.fn();
const mockSaved = { uri: 'file://out.jpg', width: 1600, height: 2000 };
jest.mock('expo-image-manipulator', () => {
  const context = {
    crop: (r: unknown) => (mockCrop(r), context),
    resize: (s: unknown) => (mockResize(s), context),
    renderAsync: () => Promise.resolve({ saveAsync: () => Promise.resolve(mockSaved) }),
  };
  return { SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: () => context } };
});
jest.mock('expo-file-system', () => ({
  File: class {
    bytes() {
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    }
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('photo shape (§6.4: 4:5 frame, short side ≥ 800 px)', () => {
  it('asks for a crop only when the shape does not fit the frame', () => {
    expect(needsCrop(3000, 4000)).toBe(false); // 3:4 portrait
    expect(needsCrop(1080, 1350)).toBe(false); // 4:5
    expect(needsCrop(2000, 2000)).toBe(false); // square
    expect(needsCrop(1080, 1920)).toBe(false); // 9:16
    expect(needsCrop(4000, 3000)).toBe(true); // landscape
    expect(needsCrop(1000, 3000)).toBe(true); // very tall
    expect(needsCrop(0, 0)).toBe(false);
  });

  it('flags photos that are too small', () => {
    expect(isTooSmall(799, 2000)).toBe(true);
    expect(isTooSmall(800, 1000)).toBe(false);
    expect(isTooSmall(0, 0)).toBe(false);
  });

  it('never upscales and caps the long side', () => {
    expect(targetSize(1000, 1200)).toEqual({ width: 1000, height: 1200 });
    expect(targetSize(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  });
});

describe('crop geometry', () => {
  const landscape: CropView = { width: 4000, height: 3000, frameWidth: 300, frameHeight: 375 };

  it('covers the frame at zoom 1 and centres by default', () => {
    const s = coverScale(landscape);
    expect(s).toBeCloseTo(375 / 3000);
    const c = centredOffset(landscape, 1);
    expect(c.y).toBeCloseTo(0);
    expect(cropRect(landscape, 1, c)).toEqual({
      originX: 800,
      originY: 0,
      width: 2400,
      height: 3000,
    });
  });

  it('keeps the image covering the frame when dragged too far', () => {
    expect(clampOffset(landscape, 1, 50, 50)).toEqual({ x: 0, y: 0 });
    const far = clampOffset(landscape, 1, -10_000, -10_000);
    expect(far.x).toBeCloseTo(300 - 4000 * coverScale(landscape));
    expect(far.y).toBeCloseTo(0);
    expect(cropRect(landscape, 1, { x: -10_000, y: 0 }).originX).toBe(1600);
  });

  it('stops zooming where the crop would fall under 800 px wide', () => {
    const z = maxZoom(landscape);
    expect(z).toBeCloseTo(3);
    expect(cropRect(landscape, z, centredOffset(landscape, z)).width).toBe(800);
    expect(maxZoom({ width: 900, height: 1125, frameWidth: 300, frameHeight: 375 })).toBe(1.125);
    expect(maxZoom({ width: 700, height: 900, frameWidth: 300, frameHeight: 375 })).toBe(1);
  });

  it('crops through the image manipulator', async () => {
    const rect = { originX: 800, originY: 0, width: 2400, height: 3000 };
    expect(await cropImage('file://in.jpg', rect)).toEqual(mockSaved);
    expect(mockCrop).toHaveBeenCalledWith(rect);
  });
});

describe('prepareImage', () => {
  it('rejects small photos before any work', async () => {
    expect(await prepareImage('file://s.jpg', 600, 500)).toEqual({
      ok: false,
      reason: 'too_small',
    });
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('re-encodes and resizes large photos', async () => {
    const r = await prepareImage('file://big.jpg', 3000, 4000);
    expect(mockResize).toHaveBeenCalledWith({ width: 1536, height: null });
    expect(r).toEqual({ ok: true, bytes: new Uint8Array([1, 2, 3]), width: 1600, height: 2000 });
  });
});
