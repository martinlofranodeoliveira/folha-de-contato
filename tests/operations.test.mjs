import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogSession} from '../src/operations.mjs';
import {newProject,updateSettings} from '../src/model.mjs';
const pending=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('a late decode cannot overwrite a newer explicit edit',async()=>{
 const session=new CatalogSession(),pause=pending();let current;
 const operation=session.run(async(initial,isCurrent)=>{current=isCurrent;await pause.promise;return updateSettings(initial,{title:'Leitura antiga'});});
 await Promise.resolve();assert.equal(current(),true);
 session.edit(p=>updateSettings(p,{title:'Alteração mais recente'}));assert.equal(session.busy,false);assert.equal(current(),false);
 pause.resolve();assert.deepEqual(await operation,{applied:false,stale:true});assert.equal(session.project.settings.title,'Alteração mais recente');
});
test('only one decoder runs; a newer queued import replaces an older read',async()=>{
 const session=new CatalogSession(),pause=pending(),events=[];
 const first=session.run(async p=>{events.push('primeiro iniciou');await pause.promise;events.push('primeiro terminou');return updateSettings(p,{title:'Primeiro'});});
 await Promise.resolve();
 const second=session.run(async p=>{events.push('segundo iniciou');return updateSettings(p,{title:'Segundo'});});
 assert.deepEqual(events,['primeiro iniciou']);pause.resolve();
 assert.equal((await first).stale,true);assert.equal((await second).applied,true);
 assert.deepEqual(events,['primeiro iniciou','primeiro terminou','segundo iniciou']);assert.equal(session.project.settings.title,'Segundo');
});
test('a superseded queued task never begins and failures leave the previous catalog',async()=>{
 const session=new CatalogSession(),pause=pending();let starts=0;
 const first=session.run(async p=>{await pause.promise;return p;});await Promise.resolve();
 const skipped=session.run(async()=>{starts++;return newProject();});
 const failed=session.run(async()=>{throw new Error('Falha de leitura');});pause.resolve();
 await first;assert.equal((await skipped).stale,true);await assert.rejects(failed,/Falha de leitura/);
 assert.equal(starts,0);assert.equal(session.revision,0);assert.equal(session.busy,false);assert.equal(session.project.settings.title,'Catálogo de produtos');
});
test('an invalid prepared document is atomic and the next operation still works',async()=>{
 const session=new CatalogSession(),before=session.project;
 await assert.rejects(session.run(async()=>({schemaVersion:2})));assert.equal(session.project,before);assert.equal(session.busy,false);
 assert.equal((await session.run(async p=>updateSettings(p,{title:'Recuperado'}))).applied,true);assert.equal(session.project.settings.title,'Recuperado');
});
test('new project cancels a pending read including a late rejection',async()=>{
 const session=new CatalogSession(updateSettings(newProject(),{title:'Anterior'})),pause=pending();
 const operation=session.run(async()=>pause.promise);await Promise.resolve();
 session.replace(newProject());pause.reject(new Error('Erro de uma operação já cancelada'));
 assert.equal((await operation).stale,true);assert.equal(session.project.settings.title,'Catálogo de produtos');assert.equal(session.busy,false);
});

test('subscriber exceptions cannot strand busy state or disguise an applied operation',async()=>{
 const session=new CatalogSession();
 session.subscribe(()=>{throw new Error('Falha do observador');});
 assert.equal((await session.run(async p=>updateSettings(p,{title:'Aplicado'}))).applied,true);
 assert.equal(session.busy,false);assert.equal(session.revision,1);assert.equal(session.project.settings.title,'Aplicado');
});
test('validation reentry cannot overwrite a later edit',async()=>{
 const session=new CatalogSession();let once=true;
 const proxy=new Proxy({...newProject()},{getPrototypeOf(target){
  if(once){once=false;session.edit(p=>updateSettings(p,{title:'Edição durante a validação'}));}
  return Reflect.getPrototypeOf(target);
 }});
 const result=await session.run(async()=>proxy);
 assert.equal(result.stale,true);assert.equal(session.project.settings.title,'Edição durante a validação');
});
test('an operation queued from a subscriber still waits for the active decoder',async()=>{
 const session=new CatalogSession(),pause=pending(),events=[];let once=true,nested;
 session.subscribe(()=>{if(once){once=false;nested=session.run(async p=>{events.push('novo');return updateSettings(p,{title:'Novo'});});}});
 const old=session.run(async p=>{events.push('antigo');await pause.promise;return p;});
 await old;await nested;
 assert.deepEqual(events,['novo']);assert.equal(session.project.settings.title,'Novo');assert.equal(session.busy,false);
});
