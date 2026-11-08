import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, ProjectError, appendItems, newProject } from '../src/model.mjs';
import { inspectSource, normalizeLocalFile, validateEmbeddedImages, rasterizeSvg } from '../src/image-io.mjs';
import { realPng, imageItem, jpegHeader } from './io-fixtures.mjs';

const errorCode = code => error => error instanceof ProjectError && error.code === code;
const localFile = (bytes, name = 'foto-de_produto.png') => ({ size: bytes.byteLength, name, arrayBuffer: async () => bytes.slice().buffer });

async function browser(options, callback) {
  const keys = ['document', 'createImageBitmap', 'Image', 'URL'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const state = { bitmaps: [], canvases: [], decoded: [], urls: [], revoked: [], draws: [], imageSrc: [] };
  let decoded = 0;
  const values = {
    createImageBitmap: async (blob, settings) => {
      state.decoded.push({ blob, settings });
      const index = decoded++;
      if (options.decodeReject === index) throw new Error('PRIVATE_DECODE_BACKEND');
      const size = options.sizes?.[index] ?? options.sizes?.at(-1) ?? [2, 3];
      const bitmap = { width: size[0], height: size[1], closed: false, close() { this.closed = true; } };
      state.bitmaps.push(bitmap);
      return bitmap;
    },
    document: { createElement(name) {
      assert.equal(name, 'canvas');
      const canvas = { width: 0, height: 0, getContext() {
        if (options.noContext) return null;
        return { drawImage(...args) { if (options.drawReject) throw new Error('PRIVATE_DRAW_BACKEND'); state.draws.push(args); } };
      }, toBlob(callback, mime) {
        assert.equal(mime, 'image/png');
        if (options.encodeThrow) throw new Error('PRIVATE_ENCODE_BACKEND');
        if (options.encodeNull) return callback(null);
        if (options.encodeSize) return callback(new Blob([new Uint8Array(options.encodeSize)], { type: 'image/png' }));
        const width = options.encodedDimensions?.[0] ?? this.width;
        const height = options.encodedDimensions?.[1] ?? this.height;
        callback(new Blob([realPng(width, height)], { type: 'image/png' }));
      } };
      state.canvases.push(canvas);
      return canvas;
    } },
    Image: class {
      naturalWidth = options.pageWidth ?? 1191;
      naturalHeight = options.pageHeight ?? 1684;
      set src(value) { state.imageSrc.push(value); }
      get src() { return state.imageSrc.at(-1); }
      async decode() { if (options.imageReject) throw new Error('PRIVATE_IMAGE_BACKEND'); }
    },
    URL: { createObjectURL(blob) { state.urls.push(blob); return 'blob:owned-example'; }, revokeObjectURL(url) { state.revoked.push(url); } },
  };
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] });
    return await callback(state);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

test('inspects real synthetic PNG headers and baseline/progressive JPEG dimensions', () => {
  assert.deepEqual(inspectSource(realPng(4, 7)), { mime: 'image/png', width: 4, height: 7 });
  for (const marker of [0xc0,0xc1,0xc2]) assert.deepEqual(inspectSource(jpegHeader(1200,800,marker)), { mime: 'image/jpeg', width: 1200, height: 800 });
});

test('rejects unsupported image input, oversize bytes and malformed PNG IHDR before decoding', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([60,115,118,103,62]), new Uint8Array([71,73,70,56,57,97])]) {
    assert.throws(() => inspectSource(bytes), errorCode('image_format'));
  }
  for (const value of [null, {}, 'PNG', new ArrayBuffer(10)]) assert.throws(() => inspectSource(value), errorCode('image_source'));
  assert.throws(() => inspectSource(new Uint8Array(LIMITS.maxSourceBytes + 1)), errorCode('image_size'));
  assert.throws(() => inspectSource(realPng().subarray(0, 29)), errorCode('image_header'));
  const badLength = realPng(); badLength[11] = 12;
  assert.throws(() => inspectSource(badLength), errorCode('image_header'));
  for (const [offset, value] of [[24,3],[25,5],[26,1],[27,1],[28,2]]) {
    const bytes = realPng(); bytes[offset] = value;
    assert.throws(() => inspectSource(bytes), errorCode('image_header'));
  }
});

test('source dimensions enforce the exact pixel budget without allocating the full pixel image', () => {
  const bytes = realPng();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(16,4000); view.setUint32(20,4000);
  assert.deepEqual(inspectSource(bytes), {mime:'image/png',width:4000,height:4000});
  view.setUint32(20,4001);
  assert.throws(() => inspectSource(bytes), errorCode('image_dimensions'));
  view.setUint32(16,0);
  assert.throws(() => inspectSource(bytes), errorCode('image_dimensions'));
});

test('JPEG traversal rejects truncated segments, unsupported SOF and excessive marker count', () => {
  for (const bytes of [jpegHeader().subarray(0,15), new Uint8Array([255,216,255,225,0,1]),
    new Uint8Array([255,216,255,218,0,2]), jpegHeader(2,3,0xc3)]) {
    assert.throws(() => inspectSource(bytes), errorCode('image_header'));
  }
  const markers = new Uint8Array(2 + 4097 * 4 + jpegHeader().length - 2);
  markers.set([255,216]);
  for (let offset=2; offset<2+4097*4; offset+=4) markers.set([255,225,0,2],offset);
  markers.set(jpegHeader().subarray(2),2+4097*4);
  assert.throws(() => inspectSource(markers), errorCode('image_header'));
});

test('normalization preserves small dimensions, derives a safe product name and closes decoder resources', async () => {
  await browser({sizes:[[2,3]]}, async state => {
    const item = await normalizeLocalFile(localFile(realPng(2,3),'  meu-produto_azul.png\n'), 'img-7');
    assert.equal(item.id,'img-7'); assert.equal(item.fileName,'meu-produto_azul.png'); assert.equal(item.name,'meu produto azul');
    assert.equal(item.width,2); assert.equal(item.height,3); assert.equal(item.priceMinor,null);
    assert.deepEqual(state.decoded[0].settings,{imageOrientation:'from-image'});
    assert.equal(state.decoded.length,1); assert.equal(state.bitmaps[0].closed,true);
    assert.deepEqual(state.draws[0].slice(1),[0,0,2,3]);
    assert.equal(state.canvases[0].width,1); assert.equal(state.canvases[0].height,1);
    assert.deepEqual(inspectSource(new Uint8Array(Buffer.from(item.png.split(',')[1],'base64'))),{mime:'image/png',width:2,height:3});
  });
});

test('normalization accepts orientation-swapped JPEG dimensions and limits the longest side to 800', async () => {
  await browser({sizes:[[1200,1600]]}, async state => {
    const item = await normalizeLocalFile(localFile(jpegHeader(1600,1200),'produto.jpg'),'img-1');
    assert.deepEqual([item.width,item.height],[600,800]);
    assert.deepEqual(state.draws[0].slice(1),[0,0,600,800]);
    assert.equal(state.bitmaps[0].closed,true);
  });
});

test('invalid source and false file size never reach the browser decoder', async () => {
  await browser({}, async state => {
    await assert.rejects(normalizeLocalFile(localFile(new Uint8Array([1,2,3])),'img-1'),errorCode('image_format'));
    await assert.rejects(normalizeLocalFile({size:LIMITS.maxSourceBytes+1,arrayBuffer(){throw Error('READ');}},'img-1'),errorCode('image_size'));
    await assert.rejects(normalizeLocalFile({size:10,arrayBuffer:async()=>new ArrayBuffer(3)},'img-1'),errorCode('image_read'));
    assert.equal(state.decoded.length,0);
  });
});

test('decode, canvas, encoder and dimensional failures are sanitized and close available resources', async () => {
  const cases = [
    [{decodeReject:0},'image_decode'],[{sizes:[[8,9]]},'image_dimensions'],[{noContext:true},'browser_support'],
    [{drawReject:true},'image_decode'],[{encodeNull:true},'image_encode'],[{encodeThrow:true},'image_encode'],
    [{encodeSize:LIMITS.maxPngBytes+1},'image_size'],[{encodedDimensions:[1,1]},'image_encode'],
  ];
  for (const [options,code] of cases) await browser({sizes:[[2,3]],...options},async state=>{
    await assert.rejects(normalizeLocalFile(localFile(realPng(2,3)),'img-1'),error=>errorCode(code)(error)&&!error.message.includes('PRIVATE_'));
    assert.ok(state.bitmaps.every(bitmap=>bitmap.closed));
    assert.ok(state.canvases.every(canvas=>canvas.width===1&&canvas.height===1));
  });
});

test('embedded project decoding is sequential, exact and closes every produced bitmap', async () => {
  const project = appendItems(newProject(),[imageItem('img-1'),imageItem('img-2',{width:5,height:4})]);
  await browser({sizes:[[2,3],[5,4]]},async state=>{
    assert.equal(await validateEmbeddedImages(project),project);
    assert.equal(state.decoded.length,2);
    assert.ok(state.bitmaps.every(bitmap=>bitmap.closed));
    assert.ok(state.decoded.every(({blob})=>blob.type==='image/png'));
  });
});

test('embedded mismatch and decode failure abort without touching the project', async () => {
  const project = appendItems(newProject(),[imageItem('img-1'),imageItem('img-2')]);
  const before = JSON.stringify(project);
  for (const options of [{sizes:[[3,2]]},{decodeReject:1}]) await browser(options,async state=>{
    await assert.rejects(validateEmbeddedImages(project),error=>error instanceof ProjectError&&!error.message.includes('PRIVATE_'));
    assert.ok(state.bitmaps.every(bitmap=>bitmap.closed));
  });
  assert.equal(JSON.stringify(project),before);
});

test('rasterization uses an owned SVG URL, PNG encoder and always releases URL/canvas',async()=>{
  await browser({},async state=>{
    const blob=await rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="1191" height="1684"/>',1191,1684);
    assert.equal(blob.type,'image/png');
    assert.equal(state.urls.length,1); assert.equal(state.urls[0].type,'image/svg+xml;charset=utf-8');
    assert.deepEqual(state.revoked,['blob:owned-example']); assert.equal(state.imageSrc.at(-1),'');
    assert.deepEqual(state.draws[0].slice(1),[0,0,1191,1684]);
    assert.equal(state.canvases[0].width,1);
  });
});

test('rasterization validates bounds and sanitizes decode/encoder failures with URL release',async()=>{
  await browser({},async state=>{
    for (const [width,height] of [[0,1],[2001,1],[1900,1900],[true,2],[1.5,2]]) {
      await assert.rejects(rasterizeSvg('<svg/>',width,height),errorCode('page_export'));
    }
    assert.equal(state.urls.length,0);
  });
  for (const options of [{imageReject:true},{pageWidth:100},{encodeNull:true},{encodeThrow:true}]) await browser(options,async state=>{
    await assert.rejects(rasterizeSvg('<svg/>',1191,1684),error=>error instanceof ProjectError&&!error.message.includes('PRIVATE_'));
    assert.deepEqual(state.revoked,['blob:owned-example']); assert.equal(state.imageSrc.at(-1),'');
  });
});
