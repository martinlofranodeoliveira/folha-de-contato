/** Original tiny raster fixtures: real PNG chunks produced with Node's zlib. */
import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4, 'ascii');
  result.set(data, 8);
  result.writeUInt32BE(crc32(result.subarray(4, data.length + 8)), data.length + 8);
  return result;
}
export function realPng(width = 1, height = 1, color = [220, 40, 60, 255]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rows.set(color, y * (1 + width * 4) + 1 + x * 4);
  }
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
export function imageItem(id = 'img-1', patch = {}) {
  const width = patch.width ?? 2, height = patch.height ?? 3;
  return { id, fileName: 'produto.png', name: 'Produto', reference: '', priceMinor: null,
    rotation: 0, width, height, png: 'data:image/png;base64,' + Buffer.from(realPng(width, height)).toString('base64'), ...patch };
}
export function jpegHeader(width = 3, height = 2, marker = 0xc0) {
  // The header fixture is intentionally not a complete decodable JPEG.
  return new Uint8Array([0xff,0xd8, 0xff,0xe1,0,6, 69,88,73,70,
    0xff,marker,0,17,8,height >> 8,height & 255,width >> 8,width & 255,3,
    1,0x11,0,2,0x11,1,3,0x11,1,0xff,0xd9]);
}
