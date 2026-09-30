/**
 * The upload pipeline: what happens to an image between choosing it and it being saved.
 *
 * Every upload is re-encoded through a canvas, which is what removes EXIF, GPS and every other
 * kind of metadata — a photograph's location should not be published because someone forgot it was
 * in there. EXIF is read first, only to prefill fields, and never written out.
 *
 * Two shapes of output, matching the two storage modes: a set of widths for object storage, or one
 * bounded image for a repository.
 */
import { readExif, type ExifFields } from './exif.js';

export const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

export interface ImageVariant {
  width: number;
  height: number;
  blob: Blob;
}

export interface PreparedImage {
  /** Read from the original, for prefilling a form. Never part of the output. */
  exif: ExifFields;
  /** Dominant colour as `#rrggbb`, used as a placeholder before the image loads. */
  color: string;
  variants: ImageVariant[];
}

/** A stable, ASCII-only name, so it survives every backend's path handling unchanged. */
export function uploadName(original: string): string {
  const base =
    original
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function encode(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob?.type === 'image/webp'
          ? resolve(blob)
          : reject(
              new Error('This browser cannot encode WebP. Use a recent Chrome, Edge or Safari.'),
            ),
      'image/webp',
      0.84,
    ),
  );
}

/** Average the image down to one pixel, which is what a placeholder needs. */
function dominantColor(bitmap: ImageBitmap): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, 16, 16);
  const pixels = context.getImageData(0, 0, 16, 16).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      sum[c] = sum[c]! + pixels[i + c]!;
    }
  }
  return `#${sum
    .map((v) =>
      Math.round((v ?? 0) / 256)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export interface PrepareOptions {
  /** Widths to produce, for object storage. */
  widths?: number[];
  /** Longest edge, for a single repository upload. */
  longEdge?: number;
}

/**
 * Re-encode an image and its variants. The output carries no metadata at all, because a canvas
 * produces pixels and nothing else.
 */
export async function prepareImage(file: File, options: PrepareOptions): Promise<PreparedImage> {
  if (!RASTER_TYPES.includes(file.type)) {
    throw new Error('Only JPEG, PNG and WebP are supported. Convert the file first.');
  }
  if (file.size > MAX_BYTES) throw new Error('Images must be 20 MB or smaller.');

  const exif = readExif(await file.arrayBuffer());
  // `from-image` applies the EXIF orientation before the metadata is discarded, so a portrait
  // photograph does not end up sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error('Images must be 40 megapixels or smaller.');
    }
    const targets = options.widths
      ? [...new Set(options.widths.map((width) => Math.min(width, bitmap.width)))].map((width) => ({
          width,
          height: Math.round((bitmap.height * width) / bitmap.width),
        }))
      : [
          (() => {
            const scale = Math.min(
              1,
              (options.longEdge ?? 2400) / Math.max(bitmap.width, bitmap.height),
            );
            return {
              width: Math.round(bitmap.width * scale),
              height: Math.round(bitmap.height * scale),
            };
          })(),
        ];

    const variants: ImageVariant[] = [];
    for (const size of targets) {
      variants.push({ ...size, blob: await encode(bitmap, size.width, size.height) });
    }
    return { exif, color: dominantColor(bitmap), variants };
  } finally {
    bitmap.close();
  }
}
