// Structural PNG fixtures intentionally do not claim successful raster decoding.
export function pngData(width = 1, height = 1, byteLength = 45) {
  const bytes = Buffer.alloc(byteLength);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  if (byteLength >= 45) bytes.write('IEND', byteLength - 8, 'ascii');
  return 'data:image/png;base64,' + bytes.toString('base64');
}
export function item(id = 'img-1', patch = {}) {
  return { id, fileName: 'produto.png', name: 'Produto', reference: '', priceMinor: null,
    rotation: 0, width: 1, height: 1, png: pngData(), ...patch };
}
