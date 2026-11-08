import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, ProjectError, newProject, validateProject, parseProjectText, stringifyProject,
  updateSettings, appendItems, updateItem, moveItem, removeItem, nextItemId,
  projectStats, formatPrice, parsePrice,
} from '../src/model.mjs';
import { pngData, item } from './fixtures.mjs';

function project(entries = [item()], changes = {}) {
  return { ...newProject(), ...changes, items: entries };
}
function error(action, code) {
  assert.throws(action, failure => failure instanceof ProjectError
    && (code === undefined || failure.code === code)
    && !failure.message.includes('PRIVATE'));
}

test('new document has the canonical defaults and is deeply immutable', () => {
  const value = newProject();
  assert.deepEqual(value, { schemaVersion: 1, settings: {
    title: 'Catálogo de produtos', subtitle: '', paper: 'a4', orientation: 'portrait',
    columns: 3, rows: 3, fit: 'contain', showNumbers: true, showPrices: true,
  }, items: [] });
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.settings) && Object.isFrozen(value.items));
  assert.deepEqual(projectStats(value), { items: 0, pages: 0, normalizedBytes: 0, pixels: 0 });
  assert.strictEqual(validateProject(value), value);
  assert.throws(() => { value.settings.rows = 5; }, TypeError);
});

test('validation clones caller objects, freezes items and preserves exact strings and order', () => {
  const source = project([item('img-8'), item('img-2', { name: '  Café & chá  ', priceMinor: 0 })]);
  const original = JSON.stringify(source);
  const value = validateProject(source);
  assert.notStrictEqual(value, source);
  assert.notStrictEqual(value.items[0], source.items[0]);
  assert.equal(JSON.stringify(source), original);
  source.items[0].name = 'editado';
  assert.equal(value.items[0].name, 'Produto');
  assert.equal(value.items[1].name, '  Café & chá  ');
  assert.ok(Object.isFrozen(value.items[0]));
  assert.equal(value.items[1].priceMinor, 0);
});

test('schema is closed at project, settings and item levels', () => {
  for (const value of [null, [], true, 1, 'PRIVATE', { ...project(), extra: 1 },
    { ...project(), schemaVersion: '1' }, { ...project(), schemaVersion: 2 },
    { settings: newProject().settings, items: [] },
    project([item()], { settings: { ...newProject().settings, extra: true } }),
    project([{ ...item(), extra: 'PRIVATE' }])]) error(() => validateProject(value));
  const absent = item(); delete absent.reference;
  error(() => validateProject(project([absent])), 'item');
  const symbol = project(); symbol[Symbol('PRIVATE')] = 1;
  error(() => validateProject(symbol), 'project');
});

test('subclasses, array holes, extra array properties and accessors are rejected without calling getters', () => {
  let calls = 0;
  const getterItem = item();
  Object.defineProperty(getterItem, 'name', { get() { calls++; return 'PRIVATE'; }, enumerable: true });
  const getterSettings = { ...newProject().settings };
  Object.defineProperty(getterSettings, 'title', { get() { calls++; return 'PRIVATE'; }, enumerable: true });
  const array = [item()];
  Object.defineProperty(array, '0', { get() { calls++; return item(); } });
  for (const value of [project([getterItem]), project([], { settings: getterSettings }), project(array),
    project(new class extends Array {}()), new class { constructor() { Object.assign(this, project()); } }(),
    project(Array(1)), project(Object.assign([item()], { PRIVATE: 1 }))]) error(() => validateProject(value));
  assert.equal(calls, 0);
});

test('text counts Unicode code points and preserves XML metacharacters for safe renderer escaping', () => {
  const value = validateProject(project([item('img-1', { name: '😀'.repeat(120), reference: '<>&"\'' })]));
  assert.equal(Array.from(value.items[0].name).length, 120);
  assert.equal(value.items[0].reference, '<>&"\'');
  error(() => validateProject(project([item('img-1', { name: '😀'.repeat(121) })])), 'text_limit');
  for (const bad of ['a\nb', '\0', '\t', '\x7f', '\ud800', '\udfff']) {
    error(() => validateProject(project([item('img-1', { name: bad })])), 'text');
  }
  error(() => updateSettings(newProject(), { title: 'a'.repeat(81) }), 'text_limit');
  error(() => updateSettings(newProject(), { subtitle: 'a'.repeat(141) }), 'text_limit');
  error(() => validateProject(project([item('img-1', { fileName: 2 })])), 'text');
});

test('item identities are bounded, unique and independent from repeated references', () => {
  for (const id of ['img-0', 'img-01', 'img-1000000', 'img-a', '', 1]) {
    error(() => validateProject(project([item(id)])), 'item_id');
  }
  error(() => validateProject(project([item(), item()])), 'duplicate_id');
  const value = validateProject(project([item('img-1', { reference: 'SKU' }), item('img-3', { reference: 'SKU' })]));
  assert.equal(nextItemId(value), 'img-2');
  assert.equal(nextItemId(newProject()), 'img-1');
});

test('settings reject implicit coercion and enforce all range endpoints', () => {
  for (const [key, values] of Object.entries({
    columns: [0, 6, true, '3', 1.1, NaN, Infinity], rows: [0, 7, false],
    showNumbers: [1, null, 'true'], showPrices: [0, undefined],
    paper: ['A4', 'letter', null], orientation: ['wide', null], fit: ['fill', null],
  })) for (const value of values) error(() => updateSettings(newProject(), { [key]: value }));
  assert.equal(updateSettings(newProject(), { columns: 5, rows: 6 }).settings.rows, 6);
  assert.equal(updateSettings(newProject(), { columns: 1, rows: 1 }).settings.columns, 1);
});

test('PNG header must match signature, IHDR dimensions and valid depth/color methods', () => {
  const valid = item('img-1', { width: 800, height: 1, png: pngData(800, 1) });
  assert.equal(validateProject(project([valid])).items[0].width, 800);
  for (const [offset, byte] of [[0, 0], [11, 12], [12, 0], [24, 3], [25, 7], [26, 1], [27, 1], [28, 2]]) {
    const bytes = Buffer.from(item().png.split(',')[1], 'base64'); bytes[offset] = byte;
    error(() => validateProject(project([item('img-1', { png: 'data:image/png;base64,' + bytes.toString('base64') })])), 'png_header');
  }
  error(() => validateProject(project([item('img-1', { width: 2 })])), 'png_header');
  for (const dimension of [0, 801, 1.2, '1', true, Infinity]) {
    error(() => validateProject(project([item('img-1', { width: dimension })])), 'dimensions');
  }
});

test('base64 requires exact MIME, alphabet, padding and unused pad bits', () => {
  const raw = Buffer.from(pngData(1, 1, 46).split(',')[1], 'base64');
  const canonical = raw.toString('base64');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const badPad = canonical.slice(0, -3) + alphabet[alphabet.indexOf(canonical.at(-3)) + 1] + '==';
  for (const png of [item().png.replace('image/png', 'image/jpeg'), item().png + '\n',
    'https://PRIVATE/example.png', 'data:image/svg+xml;base64,' + canonical,
    'data:image/png;base64,' + canonical.replace('A', '_'),
    'data:image/png;base64,' + badPad, 'data:image/png;base64,AAAA=AAA']) {
    error(() => validateProject(project([item('img-1', { png })])));
  }
  assert.equal(validateProject(project([item('img-1', { png: 'data:image/png;base64,' + canonical })])).items.length, 1);
});

test('exact 2 MiB per PNG and 16 MiB total are accepted; one byte over is rejected', () => {
  const png = pngData(1, 1, LIMITS.maxPngBytes);
  const entries = Array.from({ length: 8 }, (_, i) => item('img-' + (i + 1), { png }));
  const value = validateProject(project(entries));
  assert.equal(projectStats(value).normalizedBytes, LIMITS.maxTotalPngBytes);
  error(() => appendItems(value, [item('img-9')]), 'total_bytes');
  error(() => validateProject(project([item('img-1', { png: pngData(1, 1, LIMITS.maxPngBytes + 1) })])), 'png_size');
});

test('item and normalized pixel limits are enforced before a document can be committed', () => {
  const entries = Array.from({ length: 32 }, (_, i) => item('img-' + (i + 1)));
  assert.equal(validateProject(project(entries)).items.length, 32);
  error(() => validateProject(project([...entries, item('img-33')])), 'item_limit');
  const png = pngData(800, 800);
  const pixels = Array.from({ length: 25 }, (_, i) => item('img-' + (i + 1), { width: 800, height: 800, png }));
  const value = validateProject(project(pixels));
  assert.equal(projectStats(value).pixels, LIMITS.maxPixels);
  error(() => appendItems(value, [item('img-26')]), 'total_pixels');
});

test('JSON byte budget is inclusive and measured as UTF-8 before parsing', () => {
  const base = stringifyProject(updateSettings(newProject(), { title: 'Á' }));
  const boundary = base + ' '.repeat(LIMITS.maxProjectBytes - Buffer.byteLength(base));
  assert.equal(parseProjectText(boundary).settings.title, 'Á');
  error(() => parseProjectText(boundary + ' '), 'project_size');
  error(() => parseProjectText(boundary.slice(0, -1) + 'é'), 'project_size');
  error(() => parseProjectText('\ufeff' + base), 'project_encoding');
  for (const bad of ['{', '{}x', '{"schemaVersion":NaN}', 'PRIVATE']) error(() => parseProjectText(bad), 'project_json');
  error(() => parseProjectText(new Uint8Array()), 'project_encoding');
});

test('canonical serialization round-trips data and order byte for byte', () => {
  const raw = project([item('img-4', { name: 'Peça & <teste>', priceMinor: 123456 }), item('img-2')]);
  const value = validateProject(raw);
  const encoded = stringifyProject(value);
  assert.ok(encoded.endsWith('\n') && !encoded.endsWith('\n\n'));
  assert.ok(encoded.startsWith('{\n  "schemaVersion": 1,\n  "settings": {\n    "title":'));
  assert.equal(stringifyProject(parseProjectText(encoded)), encoded);
  assert.deepEqual(parseProjectText(encoded).items.map(x => x.id), ['img-4', 'img-2']);
});

test('edits are immutable and retain trusted PNGs without decoding them again', () => {
  const original = validateProject(project([item('img-1'), item('img-2')]));
  const before = stringifyProject(original);
  const decoder = globalThis.atob;
  globalThis.atob = () => { throw new Error('PNG should not be decoded during scalar edits'); };
  let changed;
  try {
    changed = updateItem(original, 'img-1', { name: 'Vaso', reference: 'V-1', priceMinor: 990, rotation: 90 });
    changed = updateSettings(changed, { title: 'Novidades' });
    assert.equal(projectStats(changed).normalizedBytes, 90);
  } finally { globalThis.atob = decoder; }
  assert.equal(stringifyProject(original), before);
  assert.equal(changed.items[0].name, 'Vaso');
  assert.equal(changed.items[0].png, original.items[0].png);
  assert.strictEqual(changed.items[1], original.items[1]);
  assert.throws(() => { changed.items[0].name = 'outra'; }, TypeError);
});

test('append, move, remove, stats and identifiers preserve expected product ordering', () => {
  let value = appendItems(newProject(), [item('img-1'), item('img-2'), item('img-4')]);
  const initial = value;
  value = moveItem(value, 'img-4', -1);
  assert.deepEqual(value.items.map(x => x.id), ['img-1', 'img-4', 'img-2']);
  value = removeItem(value, 'img-1');
  assert.deepEqual(value.items.map(x => x.id), ['img-4', 'img-2']);
  assert.equal(nextItemId(value), 'img-1');
  assert.deepEqual(initial.items.map(x => x.id), ['img-1', 'img-2', 'img-4']);
  assert.strictEqual(moveItem(initial, 'img-1', -1), initial);
  assert.strictEqual(moveItem(initial, 'img-4', 1), initial);
  assert.strictEqual(appendItems(initial, []), initial);
  assert.equal(projectStats(updateSettings(initial, { rows: 1, columns: 2 })).pages, 2);
});

test('patches and operations reject hidden image replacement, unknown products and invalid values', () => {
  const value = validateProject(project());
  for (const patch of [{ png: item().png }, { width: 2 }, { name: 4 }, { reference: 'x'.repeat(33) },
    { rotation: 45 }, { priceMinor: false }, { priceMinor: -1 }, { priceMinor: 1.2 }]) {
    error(() => updateItem(value, 'img-1', patch));
  }
  error(() => updateSettings(value, { PRIVATE: 1 }), 'settings_patch');
  for (const action of [() => updateItem(value, 'PRIVATE', {}), () => removeItem(value, 'PRIVATE'),
    () => moveItem(value, 'PRIVATE', 1)]) error(action, 'item_not_found');
  for (const delta of [0, 2, '1', true]) error(() => moveItem(value, 'img-1', delta), 'move');
});

test('BRL parsing and formatting use exact cents, including zero, grouping and maximum', () => {
  for (const [input, expected] of [['', null], ['   ', null], ['0', 0], ['0,01', 1], ['1,2', 120],
    ['1.234', 123400], [' 1.234,56 ', 123456], ['000012,30', 1230], ['9.999.999,99', 999999999]]) {
    assert.equal(parsePrice(input), expected, input);
  }
  assert.equal(formatPrice(null), '');
  assert.equal(formatPrice(0), 'R$ 0,00');
  assert.equal(formatPrice(123456), 'R$ 1.234,56');
  assert.equal(formatPrice(999999999), 'R$ 9.999.999,99');
  for (const amount of [0, 1, 99, 100, 199, 12345678, 999999999]) {
    assert.equal(parsePrice(formatPrice(amount).slice(3)), amount);
  }
});

test('price parser rejects ambiguous decimal points, malformed grouping and implicit coercion', () => {
  for (const input of ['12.34', '1,234', '12.3456', '.123', '1.23.456', '1234.567', '1.', ',2',
    '1,', '1e2', 'NaN', 'Infinity', 'R$ 2,00', '-1', '+1', '١٢', '\u00a01', '1\n', '10.000.000',
    '9999999,999', null, 2, {}]) error(() => parsePrice(input));
  for (const amount of [undefined, false, -1, 1000000000, 1.01, NaN, Infinity, '100']) error(() => formatPrice(amount));
});

test('fileName is a mandatory visible fallback even when the product name exists', () => {
  for (const fileName of ['', '   ', '\u2003']) {
    for (const name of ['', 'Produto']) {
      error(() => validateProject(project([item('img-1', { fileName, name })])), 'file_name');
    }
  }
  const value=validateProject(project([item('img-1',{fileName:' foto.png ',name:''})]));
  assert.equal(value.items[0].fileName,' foto.png ');
  assert.equal(value.items[0].name,'');
});
