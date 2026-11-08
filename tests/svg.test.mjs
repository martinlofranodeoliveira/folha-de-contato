import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ProjectError, appendItems, newProject, updateSettings } from '../src/model.mjs';
import { planPages } from '../src/layout.mjs';
import { toSvg } from '../src/svg.mjs';
import { imageItem } from './io-fixtures.mjs';

const parser = `import json, sys, xml.etree.ElementTree as ET
root = ET.fromstring(sys.stdin.buffer.read())
print(json.dumps({'tag':root.tag, 'elements':[{'tag':e.tag.split('}')[-1], 'attrs':e.attrib, 'text':e.text or ''} for e in root.iter()]}, ensure_ascii=True))
`;
function xml(svg) {
  const result = spawnSync('python3', ['-c', parser], {input:svg,encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}
const withItems=(items,settings={})=>appendItems(updateSettings(newProject(),settings),items);
const attrs = {
  svg: ['width','height','viewBox'], title:[], desc:[], defs:[],
  clipPath:['id'], rect:['x','y','width','height','fill'],
  g:['clip-path','font-family','fill','font-size'],
  image:['x','y','width','height','transform','href'],
  text:['x','y','font-size','font-weight','fill','text-anchor'],
};

test('SVG parses independently as XML with only a passive fixed element/attribute vocabulary',()=>{
  const project=withItems([imageItem('img-1',{name:'Caneca & tampa',reference:'SKU-001',priceMinor:12345})]);
  const text=toSvg(project);
  const parsed=xml(text);
  assert.equal(parsed.tag,'{http://www.w3.org/2000/svg}svg');
  for(const element of parsed.elements){
    assert.ok(Object.hasOwn(attrs,element.tag),element.tag);
    for(const key of Object.keys(element.attrs)) assert.ok(attrs[element.tag].includes(key),`${element.tag}:${key}`);
  }
  const root=parsed.elements[0];
  assert.deepEqual(root.attrs,{width:'1191',height:'1684',viewBox:'0 0 1191 1684'});
  const image=parsed.elements.find(element=>element.tag==='image');
  assert.equal(image.attrs.href,project.items[0].png);
  assert.ok(parsed.elements.some(element=>element.text==='SKU-001 · R$ 123,45'));
  assert.ok(text.endsWith('\n')&&!text.includes('\r'));
  assert.ok(!/foreignObject|<script|<!DOCTYPE|<style|xlink:href/i.test(text));
});

test('adversarial product text stays text and cannot add nodes, attributes or external references',()=>{
  const malicious='A & B <script>alert(1)</script> " x=\'z\'';
  const project=withItems([imageItem('img-22',{name:malicious,reference:'<image href="https://bad.test"/>'})],
    {title:'<svg onload="boom"> & catálogo',subtitle:'<foreignObject>Texto "em aspas"</foreignObject>'});
  const parsed=xml(toSvg(project));
  for(const element of parsed.elements){
    assert.ok(Object.hasOwn(attrs,element.tag));
    assert.ok(!Object.keys(element.attrs).some(key=>/^on|style/.test(key)));
  }
  assert.equal(parsed.elements.filter(element=>element.tag==='image').length,1);
  assert.ok(parsed.elements.filter(element=>element.tag==='text').some(element=>element.text.includes('<script>')));
  assert.ok(parsed.elements.filter(element=>element.tag==='text').some(element=>element.text.includes('<image href=')));
  assert.ok(parsed.elements.find(element=>element.tag==='title').text.includes('<svg onload="boom">'));
});

test('XML-excluded Unicode is replaced only in rendered title, subtitle, product name and reference',()=>{
  const project=withItems([imageItem('img-1',{name:'Nome A\uFFFE\uFFFFB',reference:'REF\uFFFE\uFFFF'})],
    {title:'Título A\uFFFE\uFFFFB',subtitle:'Subtítulo A\uFFFE\uFFFFB'});
  const original=JSON.stringify(project);
  const svg=toSvg(project);
  const parsed=xml(svg);
  assert.ok(!/[\uFFFE\uFFFF]/u.test(svg));
  assert.equal(JSON.stringify(project),original);
  assert.ok(project.settings.title.includes('\uFFFF'));
  assert.ok(project.items[0].reference.includes('\uFFFE'));
  const contents=parsed.elements.filter(element=>['title','text'].includes(element.tag)).map(element=>element.text);
  for(const expected of ['Título A\uFFFD\uFFFDB','Subtítulo A\uFFFD\uFFFDB','Nome A\uFFFD\uFFFDB','REF\uFFFD\uFFFD']) {
    assert.ok(contents.some(text=>text.includes(expected)),expected);
  }
});

test('page order, global ordinals and footer come from the complete stable project order',()=>{
  const project=withItems(Array.from({length:5},(_,index)=>imageItem(`img-${index+1}`,{name:`Produto ${index+1}`})),{columns:2,rows:1});
  const first=xml(toSvg(project,0));
  const second=xml(toSvg(project,1));
  const third=xml(toSvg(project,2));
  assert.equal(first.elements.filter(element=>element.tag==='image').length,2);
  assert.ok(second.elements.some(element=>element.text==='03. Produto 3'));
  assert.ok(second.elements.some(element=>element.text==='04. Produto 4'));
  assert.ok(second.elements.some(element=>element.text==='Página 2 de 3'));
  assert.equal(third.elements.filter(element=>element.tag==='image').length,1);
  assert.ok(third.elements.some(element=>element.text==='05. Produto 5'));
});

test('every image transform matches its layout matrix and is clipped by an untransformed parent group',()=>{
  for(const rotation of [0,90,180,270])for(const fit of ['contain','cover']){
    const project=withItems([imageItem('img-1',{width:20,height:10,rotation})],{fit});
    const plan=planPages(project),parsed=xml(toSvg(project));
    const image=parsed.elements.find(element=>element.tag==='image');
    const matrix=image.attrs.transform.match(/^matrix\(([^)]+)\)$/)[1].split(' ').map(Number);
    matrix.forEach((value,index)=>assert.ok(Math.abs(value-plan.pages[0].slots[0].placement.matrix[index])<=0.000001));
    assert.ok(!Object.hasOwn(image.attrs,'clip-path'));
    const ids=new Set(parsed.elements.filter(element=>element.tag==='clipPath').map(element=>element.attrs.id));
    for(const element of parsed.elements.filter(element=>element.attrs['clip-path'])){
      const match=element.attrs['clip-path'].match(/^url\(#(page-\d+-(?:header|footer|item-\d+-(?:photo|label)))\)$/);
      assert.ok(match); assert.ok(ids.has(match[1]));
    }
  }
});

test('all labels and header have finite clipping rectangles even at the densest landscape grid',()=>{
  const project=withItems([imageItem('img-1',{name:'W'.repeat(120),reference:'R'.repeat(32),priceMinor:999999999})],
    {title:'W'.repeat(80),subtitle:'W'.repeat(140),columns:5,rows:6,orientation:'landscape',paper:'carta'});
  const parsed=xml(toSvg(project));
  assert.deepEqual(parsed.elements[0].attrs,{width:'1584',height:'1224',viewBox:'0 0 1584 1224'});
  const clips=parsed.elements.filter(element=>element.tag==='clipPath');
  assert.equal(clips.length,4);
  for(const element of parsed.elements.filter(element=>element.tag==='rect')){
    const a=element.attrs;
    assert.ok(Number(a.x)>=0&&Number(a.y)>=0&&Number(a.width)>0&&Number(a.height)>0);
    assert.ok(Number(a.x)+Number(a.width)<=1584.000001);
    assert.ok(Number(a.y)+Number(a.height)<=1224.000001);
  }
  assert.ok(parsed.elements.some(element=>element.tag==='text'&&element.text.includes('…')));
});

test('zero price is shown, missing price absent, display switches remove prices and numbering',()=>{
  const items=[imageItem('img-1',{priceMinor:0}),imageItem('img-2',{priceMinor:null})];
  const rendered=toSvg(withItems(items));
  assert.equal((rendered.match(/R\$ 0,00/g)||[]).length,1);
  const hidden=toSvg(withItems(items,{showPrices:false,showNumbers:false}));
  assert.ok(!hidden.includes('R$'));
  const text=xml(hidden).elements.filter(element=>element.tag==='text').map(element=>element.text);
  assert.equal(text.filter(value=>value==='Produto').length,2);
});

test('SVG is deterministic, does not mutate source, and rejects invalid page indices or empty projects',()=>{
  const project=withItems([imageItem()]);
  const before=JSON.stringify(project);
  assert.equal(toSvg(project),toSvg(project));
  assert.equal(JSON.stringify(project),before);
  for(const index of [-1,1,0.5,false,NaN,Infinity,'0']){
    assert.throws(()=>toSvg(project,index),error=>error instanceof ProjectError&&error.code==='page_index');
  }
  assert.throws(()=>toSvg(newProject()),error=>error instanceof ProjectError&&error.code==='page_index');
});
