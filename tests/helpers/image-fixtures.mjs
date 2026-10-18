import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const fill = [100, 149, 237];
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length), body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length); return out;
}
export function png(width, height) {
  const row = Buffer.alloc(1 + width * 3); for (let x = 0; x < width; x++) row.set(fill, 1 + x * 3);
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(height).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
export function bmp(width, height) {
  const stride = Math.ceil(width * 3 / 4) * 4, size = 54 + stride * height, out = Buffer.alloc(size);
  out.write('BM', 0, 'latin1'); out.writeUInt32LE(size, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18); out.writeInt32LE(height, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set([fill[2], fill[1], fill[0]], 54 + y * stride + x * 3);
  return out;
}
export function tiff(width, height) {
  const pixels = Buffer.alloc(width * height * 3); for (let i = 0; i < width * height; i++) pixels.set(fill, i * 3);
  const entries = [[256, 3, 1, width], [257, 3, 1, height], [258, 3, 3, 0], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, 0], [277, 3, 1, 3], [278, 3, 1, height], [279, 4, 1, pixels.length]];
  const ifd = 8, ifdSize = 2 + entries.length * 12 + 4, bits = ifd + ifdSize, data = bits + 6, out = Buffer.alloc(data + pixels.length);
  out.write('II*\0', 0, 'latin1'); out.writeUInt32LE(ifd, 4); out.writeUInt16LE(entries.length, ifd);
  entries.forEach(([tag, type, count, value], i) => {
    const at = ifd + 2 + i * 12; out.writeUInt16LE(tag, at); out.writeUInt16LE(type, at + 2); out.writeUInt32LE(count, at + 4);
    const v = tag === 258 ? bits : tag === 273 ? data : value; type === 3 && count === 1 ? out.writeUInt16LE(v, at + 8) : out.writeUInt32LE(v, at + 8);
  });
  [8, 8, 8].forEach((b, i) => out.writeUInt16LE(b, bits + i * 2)); pixels.copy(out, data);
  return out;
}
// Encoders for these are not worth writing; both are 64x32 solid fills produced once with ImageMagick.
const JPEG = '/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAgAEADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAcI/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Aq2i0qAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//Z';
const GIF = 'R0lGODlhQAAgAPAAAGSV7QAAACH5BAAAAAAAIf8LSW1hZ2VNYWdpY2sOZ2FtbWE9MC40NTQ1NDUALAAAAABAACAAAAIthI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTNf2jef6zvf+DwwKh6QCADs=';
const WEBP = 'UklGRiQAAABXRUJQVlA4TBcAAAAvP8AHAAfQypK1vf8BICH8P69G9D/1AQA=';

export async function writeImageFixtures(directory) {
  await fs.mkdir(directory, { recursive: true });
  const files = { 'small.png': png(64, 32), 'large.png': png(4000, 1000), 'small.bmp': bmp(64, 32), 'small.tiff': tiff(64, 32), 'small.jpg': Buffer.from(JPEG, 'base64'), 'small.gif': Buffer.from(GIF, 'base64'), 'small.webp': Buffer.from(WEBP, 'base64') };
  for (const [name, bytes] of Object.entries(files)) await fs.writeFile(path.join(directory, name), bytes);
}
