import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_EDGE, reencodeImage } from './image.js';

/** Fails the test (instead of asserting with `!`) when re-encoding returned null. */
const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected a value');
  return v;
};

const make = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#2a6f97' } });

describe('reencodeImage (doc 05 V12: sharp, EXIF stripped)', () => {
  it('outputs WebP with no EXIF (camera GPS never leaves the server)', async () => {
    const jpeg = await make(8, 6)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'owner' }, IFD3: { GPSLatitudeRef: 'N' } } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const out = await reencodeImage(jpeg);
    expect(out).not.toBeNull();
    const meta = await sharp(must(out)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([8, 6]);
  });

  it('bakes the EXIF orientation into the pixels before stripping it', async () => {
    // Orientation 6 = rotate 90° clockwise to display: an 8×4 sensor image shows as 4×8.
    const rotated = await make(8, 4).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const meta = await sharp(must(await reencodeImage(rotated))).metadata();
    expect([meta.width, meta.height]).toEqual([4, 8]);
  });

  it(`shrinks large images to ${MAX_IMAGE_EDGE}px on the long edge, never enlarges`, async () => {
    const big = await make(4000, 1000).png().toBuffer();
    const meta = await sharp(must(await reencodeImage(big))).metadata();
    expect([meta.width, meta.height]).toEqual([MAX_IMAGE_EDGE, 640]);
  });

  it('rejects files that are not decodable images', async () => {
    expect(await reencodeImage(new Uint8Array(Buffer.from('%PDF-1.7 not an image')))).toBeNull();
    const truncated = (await make(64, 64).png().toBuffer()).subarray(0, 40);
    expect(await reencodeImage(truncated)).toBeNull();
  });

  it('rejects decompression bombs (too many pixels)', async () => {
    // A tiny PNG of a huge blank canvas.
    const bomb = await make(9000, 9000).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(await reencodeImage(bomb)).toBeNull();
  });
});
