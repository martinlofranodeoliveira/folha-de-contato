/** Immutable, bounded portable catalog documents. No DOM, clock or network. */
const MiB = 1024 * 1024;
export const LIMITS = Object.freeze({
  maxItems: 32, maxPngBytes: 2 * MiB, maxTotalPngBytes: 16 * MiB,
  maxPixels: 16_000_000, maxSide: 800, maxProjectBytes: 24 * MiB,
  maxSourceBytes: 8 * MiB, maxSourcePixels: 16_000_000, maxPriceMinor: 999_999_999,
});

export class ProjectError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
  }
}
const fail = (code, message) => { throw new ProjectError(code, message); };
const PROJECT_KEYS = ['schemaVersion', 'settings', 'items'];
const SETTING_KEYS = ['title', 'subtitle', 'paper', 'orientation', 'columns', 'rows', 'fit', 'showNumbers', 'showPrices'];
const ITEM_KEYS = ['id', 'fileName', 'name', 'reference', 'priceMinor', 'rotation', 'width', 'height', 'png'];
const EDIT_KEYS = ['name', 'reference', 'priceMinor', 'rotation'];
const PNG_PREFIX = 'data:image/png;base64,';
const projects = new WeakMap();
const items = new WeakMap();
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function record(value, keys, code, partial = false) {
  if (value === null || typeof value !== 'object'
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, 'O documento contém um objeto incompatível.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors);
  if ((!partial && names.length !== keys.length)
      || names.some(key => typeof key !== 'string' || !keys.includes(key)
        || !own(descriptors[key], 'value'))
      || (!partial && keys.some(key => !own(descriptors, key)))) {
    fail(code, 'O documento contém campos ausentes, extras ou incompatíveis.');
  }
  const result = {};
  for (const name of names) result[name] = descriptors[name].value;
  return result;
}

function list(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > LIMITS.maxItems) {
    fail('item_limit', 'Use uma lista com até 32 produtos.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== value.length + 1
      || Array.from({ length: value.length }, (_, index) => String(index))
        .some(key => !own(descriptors, key) || !own(descriptors[key], 'value'))) {
    fail('items_shape', 'A lista de produtos deve ser contínua e conter somente itens.');
  }
  return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}

function text(value, maximum) {
  if (typeof value !== 'string') fail('text', 'Os textos devem ser linhas de texto válidas.');
  let count = 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 31 || code === 127 || (code >= 0xd800 && code <= 0xdfff)) {
      fail('text', 'Os textos não podem conter controles ou caracteres incompletos.');
    }
    if (++count > maximum) fail('text_limit', 'Um texto ultrapassa o tamanho permitido.');
  }
  return value;
}

function integer(value, minimum, maximum, code = 'number') {
  if (typeof value !== 'number' || !Number.isInteger(value)
      || value < minimum || value > maximum) {
    fail(code, 'Um valor numérico está fora do intervalo permitido.');
  }
  return value === 0 ? 0 : value;
}
function enumeration(value, choices, code) {
  if (!choices.includes(value)) fail(code, 'Uma opção está fora do formato permitido.');
  return value;
}
function boolean(value) {
  if (typeof value !== 'boolean') fail('settings', 'As opções de exibição devem ser booleanas.');
  return value;
}
function price(value) {
  return value === null ? null : integer(value, 0, LIMITS.maxPriceMinor, 'price');
}

function settings(value) {
  const raw = record(value, SETTING_KEYS, 'settings');
  return Object.freeze({
    title: text(raw.title, 80), subtitle: text(raw.subtitle, 140),
    paper: enumeration(raw.paper, ['a4', 'carta'], 'paper'),
    orientation: enumeration(raw.orientation, ['portrait', 'landscape'], 'orientation'),
    columns: integer(raw.columns, 1, 5, 'columns'), rows: integer(raw.rows, 1, 6, 'rows'),
    fit: enumeration(raw.fit, ['contain', 'cover'], 'fit'),
    showNumbers: boolean(raw.showNumbers), showPrices: boolean(raw.showPrices),
  });
}

function pngBytes(value, width, height) {
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) {
    fail('png_format', 'A imagem embutida deve ser um PNG em base64 canônico.');
  }
  const encoded = value.slice(PNG_PREFIX.length);
  if (!encoded.length || encoded.length % 4 !== 0
      || encoded.length > Math.ceil(LIMITS.maxPngBytes / 3) * 4) {
    fail('png_size', 'Um PNG embutido ultrapassa o limite de 2 MiB ou tem tamanho inválido.');
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const dataEnd = encoded.length - padding;
  for (let index = 0; index < dataEnd; index++) {
    const code = encoded.charCodeAt(index);
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122)
        || (code >= 48 && code <= 57) || code === 43 || code === 47)) {
      fail('png_format', 'A imagem embutida deve ser um PNG em base64 canônico.');
    }
  }
  const last = alphabet.indexOf(encoded[dataEnd - 1]);
  if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) {
    fail('png_format', 'O base64 da imagem deve ter bits de preenchimento canônicos.');
  }
  const byteLength = encoded.length / 4 * 3 - padding;
  if (byteLength > LIMITS.maxPngBytes || byteLength < 33) {
    fail('png_size', 'Um PNG embutido tem tamanho fora do intervalo permitido.');
  }
  let bytes;
  try { bytes = atob(encoded); }
  catch { fail('png_format', 'A imagem embutida deve ser um PNG em base64 canônico.'); }
  const byte = index => bytes.charCodeAt(index);
  const u32 = offset => byte(offset) * 16_777_216 + byte(offset + 1) * 65_536
    + byte(offset + 2) * 256 + byte(offset + 3);
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => byte(index) !== value)
      || u32(8) !== 13 || bytes.slice(12, 16) !== 'IHDR'
      || u32(16) !== width || u32(20) !== height
      || !({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[byte(25)] || []).includes(byte(24))
      || byte(26) !== 0 || byte(27) !== 0 || ![0, 1].includes(byte(28))) {
    fail('png_header', 'O cabeçalho PNG não corresponde às dimensões e ao formato declarados.');
  }
  return byteLength;
}

function item(value) {
  if (items.has(value)) return value;
  const raw = record(value, ITEM_KEYS, 'item');
  if (typeof raw.id !== 'string' || !/^img-[1-9][0-9]{0,5}$/.test(raw.id)) {
    fail('item_id', 'Cada produto deve ter um identificador válido.');
  }
  const fileName = text(raw.fileName, 120);
  if (!fileName.trim()) fail('file_name', 'Cada imagem deve ter um nome de arquivo não vazio.');
  const width = integer(raw.width, 1, LIMITS.maxSide, 'dimensions');
  const height = integer(raw.height, 1, LIMITS.maxSide, 'dimensions');
  const byteLength = pngBytes(raw.png, width, height);
  const result = Object.freeze({
    id: raw.id, fileName, name: text(raw.name, 120),
    reference: text(raw.reference, 32), priceMinor: price(raw.priceMinor),
    rotation: enumeration(raw.rotation, [0, 90, 180, 270], 'rotation'),
    width, height, png: raw.png,
  });
  items.set(result, byteLength);
  return result;
}

export function validateProject(value) {
  if (projects.has(value)) return value;
  const raw = record(value, PROJECT_KEYS, 'project');
  if (raw.schemaVersion !== 1) fail('version', 'A versão do projeto não é compatível.');
  const config = settings(raw.settings);
  const normalized = list(raw.items).map(item);
  const ids = new Set();
  let normalizedBytes = 0;
  let pixels = 0;
  for (const entry of normalized) {
    if (ids.has(entry.id)) fail('duplicate_id', 'Os identificadores de produtos devem ser únicos.');
    ids.add(entry.id);
    normalizedBytes += items.get(entry);
    pixels += entry.width * entry.height;
  }
  if (normalizedBytes > LIMITS.maxTotalPngBytes) fail('total_bytes', 'As imagens ultrapassam o limite total de 16 MiB.');
  if (pixels > LIMITS.maxPixels) fail('total_pixels', 'As imagens ultrapassam o limite total de pixels.');
  const result = Object.freeze({ schemaVersion: 1, settings: config, items: Object.freeze(normalized) });
  projects.set(result, Object.freeze({
    items: normalized.length,
    pages: Math.ceil(normalized.length / (config.columns * config.rows)),
    normalizedBytes, pixels,
  }));
  return result;
}

export function newProject() {
  return validateProject({ schemaVersion: 1, settings: {
    title: 'Catálogo de produtos', subtitle: '', paper: 'a4', orientation: 'portrait',
    columns: 3, rows: 3, fit: 'contain', showNumbers: true, showPrices: true,
  }, items: [] });
}

export function parseProjectText(value) {
  if (typeof value !== 'string') fail('project_encoding', 'O projeto deve ser um texto JSON UTF-8.');
  if (value.charCodeAt(0) === 0xfeff) fail('project_encoding', 'O projeto deve usar UTF-8 sem BOM.');
  if (value.length > LIMITS.maxProjectBytes || new TextEncoder().encode(value).length > LIMITS.maxProjectBytes) {
    fail('project_size', 'O projeto ultrapassa o limite de 24 MiB.');
  }
  let parsed;
  try { parsed = JSON.parse(value); }
  catch { fail('project_json', 'O projeto não contém um documento JSON válido.'); }
  return validateProject(parsed);
}

export function stringifyProject(value) {
  return JSON.stringify(validateProject(value), null, 2) + '\n';
}

export function updateSettings(value, patch) {
  const project = validateProject(value);
  const changes = record(patch, SETTING_KEYS, 'settings_patch', true);
  return validateProject({ ...project, settings: { ...project.settings, ...changes } });
}

export function appendItems(value, additions) {
  const project = validateProject(value);
  const entries = list(additions);
  if (!entries.length) return project;
  return validateProject({ ...project, items: [...project.items, ...entries] });
}

function findItem(project, id) {
  if (typeof id !== 'string') fail('item_not_found', 'Selecione um produto existente.');
  const index = project.items.findIndex(entry => entry.id === id);
  if (index === -1) fail('item_not_found', 'Selecione um produto existente.');
  return index;
}

export function updateItem(value, id, patch) {
  const project = validateProject(value);
  const index = findItem(project, id);
  const changes = record(patch, EDIT_KEYS, 'item_patch', true);
  const entries = [...project.items];
  const previous = entries[index];
  const merged = { ...previous, ...changes };
  // Only these four scalar fields are editable. The PNG remains a previously
  // validated immutable payload, so typing a name does not decode megabytes.
  const edited = Object.freeze({ ...previous,
    name: text(merged.name, 120), reference: text(merged.reference, 32),
    priceMinor: price(merged.priceMinor),
    rotation: enumeration(merged.rotation, [0, 90, 180, 270], 'rotation'),
  });
  items.set(edited, items.get(previous));
  entries[index] = edited;
  return validateProject({ ...project, items: entries });
}

export function moveItem(value, id, delta) {
  const project = validateProject(value);
  const index = findItem(project, id);
  if (delta !== -1 && delta !== 1) fail('move', 'Mova o produto somente uma posição por vez.');
  const target = index + delta;
  if (target < 0 || target >= project.items.length) return project;
  const entries = [...project.items];
  [entries[index], entries[target]] = [entries[target], entries[index]];
  return validateProject({ ...project, items: entries });
}

export function removeItem(value, id) {
  const project = validateProject(value);
  const index = findItem(project, id);
  return validateProject({ ...project, items: project.items.filter((_, position) => position !== index) });
}

export function nextItemId(value) {
  const project = validateProject(value);
  const ids = new Set(project.items.map(entry => entry.id));
  for (let index = 1; index <= LIMITS.maxItems + 1; index++) {
    if (!ids.has('img-' + index)) return 'img-' + index;
  }
  fail('item_id', 'Não foi possível criar um identificador de produto.');
}

export function projectStats(value) {
  return projects.get(validateProject(value));
}

export function formatPrice(value) {
  const minor = price(value);
  if (minor === null) return '';
  const whole = String(Math.floor(minor / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + whole + ',' + String(minor % 100).padStart(2, '0');
}

export function parsePrice(value) {
  if (typeof value !== 'string') fail('price_format', 'Informe o preço em reais, como 1.234,56.');
  const clean = value.replace(/^ +| +$/g, '');
  if (!clean) return null;
  if (!/^(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)(?:,[0-9]{1,2})?$/.test(clean)) {
    fail('price_format', 'Informe o preço em reais, como 1.234,56.');
  }
  const [whole, fraction = ''] = clean.split(',');
  let units = 0;
  for (const character of whole) {
    if (character === '.') continue;
    units = units * 10 + character.charCodeAt(0) - 48;
    if (units > Math.floor(LIMITS.maxPriceMinor / 100)) fail('price', 'O preço ultrapassa o limite permitido.');
  }
  const cents = fraction ? Number(fraction.padEnd(2, '0')) : 0;
  return price(units * 100 + cents);
}
