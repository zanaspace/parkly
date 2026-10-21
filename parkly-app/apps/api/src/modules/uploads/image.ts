import sharp from 'sharp';

/** Long-edge cap: plenty for lot photos and evidence, keeps files small for low-end phones. */
export const MAX_IMAGE_EDGE = 2560;
/** Refuse to decode anything larger (decompression bombs); a 12 MP phone photo is ~12M. */
export const MAX_IMAGE_PIXELS = 40_000_000;

/**
 * Re-encodes an uploaded image to WebP (doc 05 V12). Applies the EXIF
 * orientation, then drops all metadata (sharp strips it unless asked to keep
 * it), so camera GPS and device details never reach other users. Returns null
 * for anything that is not a decodable image within the limits.
 */
export async function reencodeImage(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const out = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}
