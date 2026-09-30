// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readExif, formatExif } from '../src/upload/exif.js';
import { tiff, jpeg } from './exif-fixture.js';

describe('EXIF', () => {
  it('reads camera, lens and exposure from a JPEG', () => {
    const buffer = jpeg(
      tiff(
        [
          [0x010f, 2, 'Demo'],
          [0x0110, 2, 'Camera X1'],
          [0x0131, 2, 'Darkroom 2'],
        ],
        [
          [0x829a, 5, [1, 250]],
          [0x829d, 5, [28, 10]],
          [0x8827, 3, 400],
          [0x9003, 2, '2026:05:04 18:22:10'],
          [0x920a, 5, [35, 1]],
          [0xa434, 2, 'Demo 35mm F1.8'],
        ],
      ),
    );
    expect(readExif(buffer)).toEqual({
      camera: 'Demo Camera X1',
      lens: 'Demo 35mm F1.8',
      focalLength: '35mm',
      aperture: 'f/2.8',
      shutter: '1/250s',
      iso: 400,
      software: 'Darkroom 2',
      date: '2026-05-04',
    });
  });
  it('does not repeat the maker when the model already names it', () => {
    expect(formatExif({ make: 'Canon', model: 'Canon EOS R6' }).camera).toBe('Canon EOS R6');
    expect(formatExif({ make: 'NIKON CORPORATION', model: 'NIKON Z 6' }).camera).toBe('NIKON Z 6');
  });
  it('formats long exposures and ignores empty dates', () => {
    expect(formatExif({ exposureTime: [5, 2], dateTimeOriginal: '0000:00:00 00:00:00' })).toEqual({
      shutter: '2.5s',
    });
  });
  it('returns nothing for files without metadata or with broken bytes', () => {
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toEqual({});
    expect(readExif(new Uint8Array([1, 2, 3]).buffer)).toEqual({});
    expect(readExif(jpeg(new Uint8Array([0x49, 0x49, 42, 0, 255, 255, 0, 0])))).toEqual({});
  });
});
