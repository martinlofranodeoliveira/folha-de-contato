/** Explicit local image decoding, bounded normalization and PNG page export. */
import { LIMITS, ProjectError, appendItems, newProject, validateProject } from './model.mjs';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2]);
const MAX_JPEG_SEGMENTS = 4096;
const fail = (code, message) => { throw new ProjectError(code, message); };
const dimensions = (width, height, maxPixels) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > maxPixels) {
    fail('image_dimensions', 'A imagem excede o limite de pixels ou tem dimensões inválidas.');
  }
};

export function inspectSource(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('image_source', 'Escolha um arquivo PNG ou JPEG válido.');
  if (bytes.byteLength > LIMITS.maxSourceBytes) fail('image_size', 'Cada imagem original pode ter até 8 MiB.');
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    if (bytes.byteLength < 33) fail('image_header', 'O cabeçalho da imagem está incompleto.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
      fail('image_header', 'O cabeçalho PNG não tem o formato esperado.');
    }
    const width = view.getUint32(16), height = view.getUint32(20);
    dimensions(width, height, LIMITS.maxSourcePixels);
    const validDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
    if (!validDepths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) {
      fail('image_header', 'O cabeçalho PNG não tem o formato esperado.');
    }
    return { mime: 'image/png', width, height };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) fail('image_format', 'Use imagens PNG ou JPEG; outros formatos não são aceitos.');
  let offset = 2;
  for (let segment = 0; segment < MAX_JPEG_SEGMENTS && offset < bytes.length; segment += 1) {
    if (bytes[offset++] !== 0xff) fail('image_header', 'O cabeçalho JPEG não tem o formato esperado.');
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if (JPEG_SOF.has(marker)) {
      if (length < 8) break;
      const components = bytes[offset + 7];
      if (![1, 3, 4].includes(components) || length !== 8 + 3 * components || bytes[offset + 2] !== 8) break;
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      dimensions(width, height, LIMITS.maxSourcePixels);
      return { mime: 'image/jpeg', width, height };
    }
    // Lossless, differential and arithmetic SOF variants are outside this profile.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) break;
    offset += length;
  }
  fail('image_header', 'Não foi possível ler um cabeçalho JPEG suportado.');
}

function createCanvas(width, height) {
  if (!globalThis.document?.createElement) fail('browser_support', 'Este navegador não oferece o processamento de imagens necessário.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    discardCanvas(canvas);
    fail('browser_support', 'Este navegador não oferece o processamento de imagens necessário.');
  }
  return { canvas, context };
}
function discardCanvas(canvas) {
  try { if (canvas) { canvas.width = 1; canvas.height = 1; } } catch { /* Release is best effort. */ }
}
function canvasPng(canvas, maxBytes) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob || blob.type !== 'image/png') return reject(new ProjectError('image_encode', 'Não foi possível gerar a imagem PNG.'));
        if (blob.size > maxBytes) return reject(new ProjectError('image_size', 'O PNG gerado excede o limite de tamanho.'));
        resolve(blob);
      }, 'image/png');
    } catch {
      reject(new ProjectError('image_encode', 'Não foi possível gerar a imagem PNG.'));
    }
  });
}
function pngData(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 32768) parts.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return 'data:image/png;base64,' + btoa(parts.join(''));
}
function pngBytes(data) {
  const decoded = atob(data.slice('data:image/png;base64,'.length));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
function safeFileName(value) {
  const cleaned = Array.from(typeof value === 'string' ? value : 'imagem.png', char => {
    const point = char.codePointAt(0);
    return point < 32 || point === 127 || (point >= 0xd800 && point <= 0xdfff) ? ' ' : char;
  }).join('').replace(/\s+/gu, ' ').trim();
  return Array.from(cleaned || 'imagem.png').slice(0, 120).join('');
}
function operational(error, code, message) {
  if (error instanceof ProjectError) throw error;
  throw new ProjectError(code, message);
}

export async function normalizeLocalFile(file, id) {
  let bitmap, canvas;
  try {
    if (!file || typeof file.arrayBuffer !== 'function' || !Number.isInteger(file.size) || file.size <= 0) {
      fail('image_source', 'Escolha um arquivo PNG ou JPEG válido.');
    }
    if (file.size > LIMITS.maxSourceBytes) fail('image_size', 'Cada imagem original pode ter até 8 MiB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== file.size) fail('image_read', 'Não foi possível ler o arquivo de imagem completo.');
    const source = inspectSource(bytes);
    if (typeof globalThis.createImageBitmap !== 'function') fail('browser_support', 'Este navegador não oferece o processamento de imagens necessário.');
    bitmap = await createImageBitmap(new Blob([bytes], { type: source.mime }), { imageOrientation: 'from-image' });
    dimensions(bitmap.width, bitmap.height, LIMITS.maxSourcePixels);
    if (!((bitmap.width === source.width && bitmap.height === source.height) || (bitmap.width === source.height && bitmap.height === source.width))) {
      fail('image_dimensions', 'As dimensões decodificadas não correspondem ao cabeçalho da imagem.');
    }
    const scale = Math.min(1, LIMITS.maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const drawing = createCanvas(width, height);
    canvas = drawing.canvas;
    drawing.context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasPng(canvas, LIMITS.maxPngBytes);
    const normalized = new Uint8Array(await blob.arrayBuffer());
    const header = inspectSource(normalized);
    if (header.mime !== 'image/png' || header.width !== width || header.height !== height) {
      fail('image_encode', 'O PNG gerado não tem as dimensões esperadas.');
    }
    const fileName = safeFileName(file.name);
    const name = fileName.replace(/\.[^.]*$/u, '').replace(/[_-]+/gu, ' ').trim() || fileName;
    return appendItems(newProject(), [{ id, fileName, name, reference: '', priceMinor: null,
      rotation: 0, width, height, png: pngData(normalized) }]).items[0];
  } catch (error) {
    operational(error, 'image_decode', 'Não foi possível decodificar a imagem. Use outro arquivo PNG ou JPEG.');
  } finally {
    try { bitmap?.close(); } catch { /* Decoding resource release is best effort. */ }
    discardCanvas(canvas);
  }
}

export async function validateEmbeddedImages(rawProject) {
  const project = validateProject(rawProject);
  if (typeof globalThis.createImageBitmap !== 'function') fail('browser_support', 'Este navegador não oferece o processamento de imagens necessário.');
  for (const item of project.items) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([pngBytes(item.png)], { type: 'image/png' }), { imageOrientation: 'from-image' });
      if (bitmap.width !== item.width || bitmap.height !== item.height) {
        fail('image_dimensions', 'Uma imagem do projeto tem dimensões diferentes das declaradas.');
      }
    } catch (error) {
      operational(error, 'image_decode', 'Não foi possível decodificar uma imagem do projeto. O projeto anterior foi preservado.');
    } finally {
      try { bitmap?.close(); } catch { /* Release is best effort. */ }
    }
  }
  return project;
}

export async function rasterizeSvg(svg, width, height) {
  let canvas, image, url;
  try {
    if (typeof svg !== 'string' || new TextEncoder().encode(svg).length > LIMITS.maxProjectBytes + 131072
        || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
        || width > 2000 || height > 2000 || width * height > 3000000) {
      fail('page_export', 'Não foi possível exportar uma página com essas dimensões.');
    }
    if (typeof globalThis.Image !== 'function' || typeof globalThis.URL?.createObjectURL !== 'function') {
      fail('browser_support', 'Este navegador não oferece a exportação PNG necessária.');
    }
    url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    if (image.naturalWidth !== width || image.naturalHeight !== height) fail('page_export', 'A página decodificada não tem as dimensões esperadas.');
    const drawing = createCanvas(width, height);
    canvas = drawing.canvas;
    drawing.context.drawImage(image, 0, 0, width, height);
    return await canvasPng(canvas, LIMITS.maxProjectBytes);
  } catch (error) {
    operational(error, 'page_export', 'Não foi possível gerar a página PNG. Tente SVG ou outro navegador.');
  } finally {
    try { if (image) image.src = ''; } catch { /* Release is best effort. */ }
    try { if (url) URL.revokeObjectURL(url); } catch { /* Release is best effort. */ }
    discardCanvas(canvas);
  }
}
