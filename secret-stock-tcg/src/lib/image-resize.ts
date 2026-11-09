/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * Two reasons, both of which bite on a phone:
 *
 * 1. Vercel caps a serverless request body at 4.5MB. A modern phone camera
 *    produces 3–5MB routinely, so uploading the original fails some of the
 *    time — the worst kind of failure, because it looks random.
 * 2. Shop photos are displayed a few hundred pixels wide. Sending 12 megapixels
 *    over a phone connection to render at 400px wastes the owner's time and
 *    data every single time they add a product.
 *
 * Decoding through the browser also converts whatever the phone produced —
 * HEIC on an iPhone — into a JPEG the rest of the web can read.
 */

/** Longest edge after resizing. Comfortably more than the storefront renders. */
export const MAX_DIMENSION = 1600;
/** JPEG quality. 0.85 is the usual point where artefacts stop being visible. */
export const JPEG_QUALITY = 0.85;

export type ResizedImage = {
  file: File;
  originalBytes: number;
  resizedBytes: number;
  width: number;
  height: number;
};

/** Fit within a square bound, never scaling a small image up. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Returns the resized file, or the original when it can't be processed —
 * an odd format shouldn't stop someone adding a product, and the server
 * rejects anything genuinely too large anyway.
 */
export async function resizeImage(
  file: File,
  max: number = MAX_DIMENSION,
): Promise<ResizedImage> {
  const unchanged: ResizedImage = {
    file,
    originalBytes: file.size,
    resizedBytes: file.size,
    width: 0,
    height: 0,
  };

  if (typeof createImageBitmap !== "function") return unchanged;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return unchanged; // not a format this browser can decode
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return unchanged;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return unchanged;

    // Keep the original if shrinking made it bigger, which happens with
    // already-optimised small images.
    if (blob.size >= file.size) return { ...unchanged, width, height };

    const renamed = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file: new File([blob], renamed, { type: "image/jpeg" }),
      originalBytes: file.size,
      resizedBytes: blob.size,
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}
