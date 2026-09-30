export type Entry = [tag: number, type: 2 | 3 | 5, value: string | number | [number, number]];
// Builds a little-endian TIFF block with IFD0 and an Exif sub-IFD, the layout cameras write.
export function tiff(ifd0: Entry[], exif: Entry[]) {
  const bytes: number[] = [0x49, 0x49, 42, 0, 8, 0, 0, 0];
  const u16 = (at: number, v: number) => ((bytes[at] = v & 255), (bytes[at + 1] = v >> 8));
  const u32 = (at: number, v: number) => {
    for (let i = 0; i < 4; i++) bytes[at + i] = (v >>> (8 * i)) & 255;
  };
  const writeIfd = (entries: Entry[], start: number) => {
    const data: number[] = [];
    const dataStart = start + 2 + entries.length * 12 + 4;
    u16(start, entries.length);
    entries.forEach(([tag, type, value], i) => {
      const at = start + 2 + i * 12;
      let payload: number[];
      if (type === 2) payload = [...new TextEncoder().encode(String(value)), 0];
      else if (type === 3) payload = [Number(value) & 255, Number(value) >> 8];
      else {
        const [n, d] = value as [number, number];
        payload = [n, d].flatMap((v) => [0, 1, 2, 3].map((k) => (v >>> (8 * k)) & 255));
      }
      u16(at, tag);
      u16(at + 2, type);
      u32(at + 4, type === 5 ? 1 : type === 3 ? 1 : payload.length);
      if (payload.length <= 4) payload.forEach((b, k) => (bytes[at + 8 + k] = b));
      else {
        u32(at + 8, dataStart + data.length);
        data.push(...payload);
      }
    });
    u32(start + 2 + entries.length * 12, 0);
    data.forEach((b, k) => (bytes[dataStart + k] = b));
    return dataStart + data.length;
  };
  const exifStart = 200;
  writeIfd([...ifd0, [0x8769, 3, exifStart]], 8);
  writeIfd(exif, exifStart);
  return Uint8Array.from(bytes, (b) => b ?? 0);
}
export function jpeg(block: Uint8Array) {
  const header = [...new TextEncoder().encode('Exif'), 0, 0];
  const length = block.length + header.length + 2;
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    length >> 8,
    length & 255,
    ...header,
    ...block,
    0xff,
    0xd9,
  ]).buffer;
}

/** Inserts an EXIF APP1 segment right after the SOI marker of a real JPEG. */
export function withExif(file: Uint8Array, block: Uint8Array) {
  const segment = new Uint8Array(jpeg(block));
  // jpeg() wraps the block as SOI + APP1 + EOI; keep only the APP1 segment.
  const app1 = segment.slice(2, segment.length - 2);
  return new Uint8Array([...file.slice(0, 2), ...app1, ...file.slice(2)]);
}
