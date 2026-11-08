import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appendItems, newProject, stringifyProject, updateSettings } from '../src/model.mjs';
import { inspectSource } from '../src/image-io.mjs';
import { imageItem } from './io-fixtures.mjs';

// Controller tests execute the real ESM entry point. This deliberately small DOM
// supplies events, focus, dialogs and downloads, not browser layout or codecs.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let importNumber = 0;

async function withController(callback) {
  const globalNames = ['document', 'window', 'Image', 'createImageBitmap', 'URL'];
  const previous = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const NativeURL = globalThis.URL;
  const nodes = new Map(), allNodes = [], objectUrls = new Map(), downloads = [];
  let imageDecodes = 0;
  const document = { activeElement: null };

  class Element {
    constructor(tagName = 'div', id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.type = '';
      this.value = '';
      this.textContent = '';
      this.className = '';
      this.dataset = {};
      this.style = {};
      this.children = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.classList = { toggle() {} };
      this.disabled = false;
      this.hidden = false;
      this.open = false;
      this.modalOpenCount = 0;
      allNodes.push(this);
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    async dispatch(type) {
      for (const listener of this.listeners.get(type) || []) {
        await listener({ target: this, preventDefault() {} });
      }
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    remove() {}
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = null; }
    showModal() { this.open = true; this.modalOpenCount++; }
    click() {
      if (this.disabled) return;
      if (this.tagName === 'A' && this.download) {
        downloads.push({ name: this.download, blob: objectUrls.get(this.href) });
      }
      return this.dispatch('click');
    }
  }

  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const [, tagName, attributes, id] = match;
    const element = new Element(tagName, id);
    element.type = attributes.match(/\btype="([^"]+)"/i)?.[1] || '';
    element.busyControl = /\bdata-busy\b/.test(attributes);
    nodes.set(id, element);
  }
  const get = id => {
    assert.ok(nodes.has(id), `Unknown DOM fixture id: ${id}`);
    return nodes.get(id);
  };
  document.getElementById = id => nodes.get(id) || null;
  document.createElement = tagName => new Element(tagName);
  document.createDocumentFragment = () => new Element('fragment');
  document.querySelectorAll = selector => {
    assert.equal(selector, '[data-busy]');
    return [...nodes.values()].filter(element => element.busyControl);
  };
  document.querySelector = selector => {
    const id = selector.match(/^\[data-item-id="([^"]+)"\]$/)?.[1];
    return allNodes.findLast(element => element.dataset.itemId === id) || null;
  };
  document.body = new Element('body');
  class LocalURL extends NativeURL {
    static createObjectURL(blob) {
      const url = `blob:controller-test-${objectUrls.size + 1}`;
      objectUrls.set(url, blob);
      return url;
    }
    static revokeObjectURL() {}
  }
  const globals = {
    document,
    window: { addEventListener() {} },
    Image: class {
      async decode() { imageDecodes++; throw new Error('Simulated demonstration decoder failure'); }
    },
    createImageBitmap: async blob => {
      const { width, height } = inspectSource(new Uint8Array(await blob.arrayBuffer()));
      return { width, height, close() {} };
    },
    URL: LocalURL,
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    for (const [name, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    await import(`../src/app.mjs?controller-regression=${++importNumber}`);
    await settle(); // The intentionally failing startup demonstration has settled.
    const controller = {
      get,
      downloads,
      get imageDecodes() { return imageDecodes; },
      async input(id, value) {
        const element = get(id);
        element.focus();
        element.value = value;
        await element.dispatch('input');
      },
      async click(id) {
        const element = get(id);
        const active = document.activeElement;
        if (active && active !== element) await active.dispatch('blur');
        element.focus();
        await element.click();
        await settle();
      },
      async confirmReplacement() {
        const dialog = get('replace-dialog');
        assert.equal(dialog.open, true, 'A replacement confirmation must be open');
        dialog.returnValue = 'confirm';
        dialog.open = false;
        await dialog.dispatch('close');
        await settle();
      },
      async importProject(project) {
        const bytes = new TextEncoder().encode(stringifyProject(project));
        get('project-input').files = [{ size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer }];
        await get('project-input').dispatch('change');
        await settle();
      },
      async savedProject() {
        const before = downloads.length;
        await this.click('save-project');
        assert.equal(downloads.length, before + 1, 'Saving should request one new download');
        const saved = downloads.at(-1);
        assert.equal(saved.name, 'folha-de-contato.json');
        assert.equal(saved.blob.type, 'application/json;charset=utf-8');
        return JSON.parse(await saved.blob.text());
      },
    };
    await callback(controller);
  } finally {
    for (const name of globalNames) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function sampleProject() {
  return appendItems(updateSettings(newProject(), { title: 'Título válido', subtitle: 'Subtítulo válido' }), [
    imageItem('img-1', { name: 'Produto válido', reference: 'REF-1', priceMinor: 12900 }),
  ]);
}

test('failed demonstration replacement preserves an invalid price draft and blocks downloads', async () => {
  await withController(async app => {
    await app.importProject(sampleProject());
    assert.equal(app.get('item-price').value, '129,00');
    await app.input('item-price', '12,');
    assert.equal(app.get('save-project').disabled, true);
    const decodesBefore = app.imageDecodes;
    await app.click('load-demo');
    await app.confirmReplacement();
    assert.equal(app.imageDecodes, decodesBefore + 1, 'The actual makeDemo decoder must have been attempted');
    assert.equal(app.get('item-price').value, '12,');
    assert.equal(app.get('item-price').getAttribute('aria-invalid'), 'true');
    for (const id of ['save-project', 'export-svg', 'export-png']) assert.equal(app.get(id).disabled, true, id);
    assert.match(app.get('status').className, /error/);
    assert.equal(app.get('item-name').value, 'Produto válido');
    await app.input('item-price', '129,00');
    assert.deepEqual(await app.savedProject(), JSON.parse(stringifyProject(sampleProject())));
  });
});

test('invalid focused text is restored explicitly and matches the downloaded document', async () => {
  await withController(async app => {
    await app.importProject(sampleProject());
    const cases = [
      ['item-name', 'Novo nome válido', project => project.items[0].name],
      ['item-reference', 'REF-2', project => project.items[0].reference],
      ['sheet-title', 'Novo título válido', project => project.settings.title],
      ['sheet-subtitle', 'Novo subtítulo válido', project => project.settings.subtitle],
    ];
    for (const [id, valid, savedValue] of cases) {
      await app.input(id, valid);
      await app.input(id, 'Texto\u007finválido');
      assert.equal(app.get(id).value, valid, `${id}: keep the last valid value visible`);
      assert.match(app.get('status').className, /error/);
      assert.match(app.get('status').textContent, /anterior|restaur|revert|mantid/i, 'Explain that the visible value was restored');
      assert.equal(savedValue(await app.savedProject()), valid, `${id}: the downloaded value must match the field`);
    }
  });
});

test('New does not ask to replace a default empty document after an earlier replacement', async () => {
  await withController(async app => {
    await app.importProject(sampleProject());
    await app.click('new-project');
    await app.confirmReplacement();
    const dialog = app.get('replace-dialog'), count = dialog.modalOpenCount;
    assert.match(app.get('catalog-summary').textContent, /^0 produtos/);
    await app.click('new-project');
    assert.equal(dialog.open, false);
    assert.equal(dialog.modalOpenCount, count, 'An empty default document has no data to confirm');
    assert.deepEqual(await app.savedProject(), JSON.parse(stringifyProject(newProject())));
  });
});
