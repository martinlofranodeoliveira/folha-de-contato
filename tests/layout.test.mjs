import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, appendItems, updateSettings, updateItem, stringifyProject } from '../src/model.mjs';
import { planPages } from '../src/layout.mjs';
import { item, pngData } from './fixtures.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function catalog(count = 1, patch = {}) {
  return appendItems(newProject(), Array.from({ length: count }, (_, i) => item('img-' + (i + 1), patch)));
}
function transform(matrix, x, y) {
  const [a,b,c,d,e,f] = matrix;
  return [a*x+c*y+e,b*x+d*y+f];
}
function extents(matrix, width, height) {
  const points = [[0,0],[width,0],[0,height],[width,height]].map(([x,y]) => transform(matrix,x,y));
  return { left: Math.min(...points.map(p=>p[0])), right: Math.max(...points.map(p=>p[0])),
    top: Math.min(...points.map(p=>p[1])), bottom: Math.max(...points.map(p=>p[1])) };
}

test('paper dimensions and landscape rotation are explicit even for empty projects', () => {
  for (const [paper, orientation, width, height] of [['a4','portrait',1191,1684], ['a4','landscape',1684,1191],
    ['carta','portrait',1224,1584], ['carta','landscape',1584,1224]]) {
    const plan = planPages(updateSettings(newProject(), { paper, orientation }));
    assert.equal(plan.width,width); assert.equal(plan.height,height); assert.deepEqual(plan.pages,[]);
  }
});

test('default cell coordinates, reserved label area and immutable result match independent arithmetic', () => {
  const plan = planPages(catalog(2));
  const [first,second] = plan.pages[0].slots;
  close(first.frame.x,56); close(first.frame.y,174);
  close(first.frame.width,(1191-2*56-2*18)/3);
  close(first.frame.height,((1684-94)-174-2*18)/3-64);
  close(first.label.y,first.frame.y+first.frame.height+10);
  close(first.label.height,54);
  close(second.frame.x,first.frame.x+first.frame.width+18);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.pages) && Object.isFrozen(first.frame)
    && Object.isFrozen(first.placement.matrix));
});

test('pagination is row-major and keeps global ordinals and order through last partial page', () => {
  const source = updateSettings(catalog(14), { columns:3, rows:2 });
  const plan = planPages(source);
  assert.deepEqual(plan.pages.map(p=>p.slots.length),[6,6,2]);
  assert.deepEqual(plan.pages.map(p=>p.pageNumber),[1,2,3]);
  assert.deepEqual(plan.pages.flatMap(p=>p.slots.map(s=>s.itemId)),source.items.map(x=>x.id));
  assert.deepEqual(plan.pages.flatMap(p=>p.slots.map(s=>s.ordinal)),Array.from({length:14},(_,i)=>i+1));
  const [a,b,c,d] = plan.pages[0].slots;
  assert.equal(a.frame.y,b.frame.y); assert.equal(b.frame.y,c.frame.y);
  close(d.frame.x,a.frame.x); close(d.frame.y,a.frame.y+a.frame.height+64+18);
});

test('every allowed grid and paper keeps positive frames and labels within the page margins', () => {
  const full = catalog(32);
  for (const paper of ['a4','carta']) for (const orientation of ['portrait','landscape']) {
    for (let columns=1;columns<=5;columns++) for(let rows=1;rows<=6;rows++) {
      const plan = planPages(updateSettings(full,{paper,orientation,columns,rows}));
      assert.equal(plan.pages.length,Math.ceil(32/(columns*rows)));
      for(const page of plan.pages) for(const slot of page.slots) {
        assert.ok(slot.frame.width>0 && slot.frame.height>0);
        assert.ok(slot.frame.x>=56 && slot.frame.y>=174);
        assert.ok(slot.frame.x+slot.frame.width<=plan.width-56+1e-8);
        assert.ok(slot.label.y+slot.label.height<=plan.height-94+1e-8);
        assert.ok(slot.label.y>slot.frame.y+slot.frame.height);
      }
    }
  }
});

test('contain matrices independently preserve center, scale and aspect for all right-angle rotations', () => {
  for(const rotation of [0,90,180,270]) for(const [width,height] of [[200,100],[100,200],[100,100]]) {
    const value = catalog(1,{width,height,png:pngData(width,height),rotation});
    const slot = planPages(value).pages[0].slots[0];
    const matrix = slot.placement.matrix;
    const center = transform(matrix,width/2,height/2);
    close(center[0],slot.frame.x+slot.frame.width/2);
    close(center[1],slot.frame.y+slot.frame.height/2);
    const box = extents(matrix,width,height);
    assert.ok(box.left>=slot.frame.x-1e-8 && box.right<=slot.frame.x+slot.frame.width+1e-8);
    assert.ok(box.top>=slot.frame.y-1e-8 && box.bottom<=slot.frame.y+slot.frame.height+1e-8);
    const edgeRatio = (box.right-box.left)/(box.bottom-box.top);
    close(edgeRatio,rotation===90||rotation===270 ? height/width : width/height);
    assert.ok(Math.abs(box.right-box.left-slot.frame.width)<1e-8
      || Math.abs(box.bottom-box.top-slot.frame.height)<1e-8);
    const determinant = matrix[0]*matrix[3]-matrix[1]*matrix[2];
    assert.ok(determinant>0);
  }
});

test('cover matrices cover the entire frame for portrait, landscape and rotated sources', () => {
  for(const rotation of [0,90,180,270]) for(const [width,height] of [[200,100],[100,200]]) {
    const value=updateSettings(catalog(1,{width,height,png:pngData(width,height),rotation}),{fit:'cover'});
    const slot=planPages(value).pages[0].slots[0];
    const box=extents(slot.placement.matrix,width,height);
    assert.ok(box.left<=slot.frame.x+1e-8 && box.right>=slot.frame.x+slot.frame.width-1e-8);
    assert.ok(box.top<=slot.frame.y+1e-8 && box.bottom>=slot.frame.y+slot.frame.height-1e-8);
    assert.ok(Math.abs(box.right-box.left-slot.frame.width)<1e-8
      || Math.abs(box.bottom-box.top-slot.frame.height)<1e-8);
  }
});

test('rotation is clockwise, rather than a reflected or counterclockwise transform', () => {
  const value=catalog(1,{width:200,height:100,png:pngData(200,100),rotation:90});
  const slot=planPages(value).pages[0].slots[0];
  const origin=transform(slot.placement.matrix,0,0);
  const right=transform(slot.placement.matrix,200,0);
  close(origin[0],right[0]); assert.ok(right[1]>origin[1]);
  const down=transform(slot.placement.matrix,0,100);
  assert.ok(down[0]<origin[0]); close(down[1],origin[1]);
});

test('names wrap to two bounded lines with elision while source data remains intact', () => {
  const name='Produto com nome bastante longo que descreve uma coleção especial em detalhes para uma apresentação cuidadosa';
  const value=updateSettings(catalog(1,{name}),{columns:5});
  const before=stringifyProject(value);
  const slot=planPages(value).pages[0].slots[0];
  assert.equal(slot.nameLines.length,2);
  assert.ok(slot.nameLines[1].endsWith('…'));
  assert.ok(slot.nameLines.every((line,index)=>Array.from(line).length*16+(index===0?36:0)<=slot.label.width));
  assert.equal(stringifyProject(value),before);
  const fallback=planPages(updateItem(value,'img-1',{name:''})).pages[0].slots[0];
  assert.equal(fallback.nameLines.join(''),'produto.png');
});

test('detail labels distinguish missing prices and real zero while preserving the visible price', () => {
  const value=catalog(1,{reference:'REF-01',priceMinor:0});
  assert.equal(planPages(value).pages[0].slots[0].detailLine,'REF-01 · R$ 0,00');
  assert.equal(planPages(updateSettings(value,{showPrices:false})).pages[0].slots[0].detailLine,'REF-01');
  assert.equal(planPages(updateItem(value,'img-1',{reference:''})).pages[0].slots[0].detailLine,'R$ 0,00');
  assert.equal(planPages(updateItem(value,'img-1',{reference:'',priceMinor:null})).pages[0].slots[0].detailLine,'');
  const long=updateSettings(updateItem(value,'img-1',{reference:'R'.repeat(32),priceMinor:999999999}),{columns:5});
  const detail=planPages(long).pages[0].slots[0].detailLine;
  assert.ok(detail.includes('…') && detail.endsWith('R$ 9.999.999,99'));
});

test('repeated calls do not depend on a clock or mutate the input project', () => {
  const value=catalog(4);
  assert.deepEqual(planPages(value),planPages(value));
  assert.equal(planPages(value).pages[0].slots[3].ordinal,4);
  assert.ok(!JSON.stringify(planPages(value)).includes('Date'));
});

test('wide glyph regression visibly elides long names in five-column A4 with and without numbering', () => {
  for(const showNumbers of [true,false]) {
    const value=updateSettings(catalog(1,{name:'W'.repeat(44)}),{columns:5,showNumbers});
    const slot=planPages(value).pages[0].slots[0];
    assert.equal(slot.nameLines.length,2);
    assert.ok(slot.nameLines[1].endsWith('…'));
    assert.ok(slot.nameLines.every((line,index)=>Array.from(line).length*16
      +(showNumbers && index===0?36:0)<=slot.label.width));
    // At 15px Arial/Liberation Sans the measured width of W is below 16px;
    // this bound leaves room for the prefix rather than clipping an unmarked name.
    assert.ok(slot.nameLines.every(line=>Array.from(line).length<22));
    assert.equal(value.items[0].name,'W'.repeat(44));
  }
});

test('conservative name line budgets reserve only the first-line ordinal and cover every grid', () => {
  for(const showNumbers of [true,false]) for(let columns=1;columns<=5;columns++) {
    const value=updateSettings(catalog(1,{name:'W'.repeat(120)}),{columns,showNumbers});
    const slot=planPages(value).pages[0].slots[0];
    for(const [index,line] of slot.nameLines.entries()) {
      const marker=showNumbers && index===0 ?36:0;
      assert.ok(Array.from(line).length*16+marker<=slot.label.width);
    }
  }
});
