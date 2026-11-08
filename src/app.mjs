import {LIMITS,ProjectError,newProject,parseProjectText,stringifyProject,updateSettings,appendItems,updateItem,moveItem,removeItem,nextItemId,projectStats,formatPrice,parsePrice} from './model.mjs';
import {planPages} from './layout.mjs';
import {toSvg} from './svg.mjs';
import {normalizeLocalFile,validateEmbeddedImages,rasterizeSvg} from './image-io.mjs';
import {makeDemo} from './demo.mjs';
import {CatalogSession} from './operations.mjs';

const $=id=>document.getElementById(id),session=new CatalogSession();
let selectedId=null,pageIndex=0,tab='product',isDemo=false,previewUrl=null,previewKey='',exporting=false,pendingReplacement=null,undoRemoval=null;
const priceDrafts=new Map();
let paperDimensions=null;
function fitPaper(){
 const stage=$('canvas-stage'),width=stage.clientWidth,height=stage.clientHeight;
 if(!paperDimensions||!width||!height)return;
 const style=getComputedStyle(stage),availableWidth=width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),availableHeight=height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
 const scale=Math.min(availableWidth/paperDimensions.width,availableHeight/paperDimensions.height);
 $('paper-wrap').style.width=`${Math.floor(paperDimensions.width*scale)}px`;$('paper-wrap').style.height=`${Math.floor(paperDimensions.height*scale)}px`;
}
if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitPaper).observe($('canvas-stage'));
window.addEventListener('resize',fitPaper);
const currentItem=()=>session.project.items.find(item=>item.id===selectedId);
const busy=()=>session.busy||exporting;
const priceText=value=>formatPrice(value).replace(/^R\$ /,'');
const settingControls={title:'sheet-title',subtitle:'sheet-subtitle',paper:'sheet-paper',orientation:'sheet-orientation',columns:'sheet-columns',rows:'sheet-rows',fit:'sheet-fit',showNumbers:'sheet-numbers',showPrices:'sheet-prices'};
function message(text,kind='info'){
 if(priceDrafts.size&&kind==='info'){text='Há preço em edição. Corrija os produtos sinalizados antes de salvar ou exportar.';kind='error';}
 $('status').textContent=text;$('status').className='status'+(kind==='error'?' error':kind==='busy'?' busy':'');
}
function failure(error){message(error instanceof ProjectError?error.message:'Não foi possível concluir a operação. Tente novamente com um arquivo válido.','error');}
function fieldValue(element,value){if(document.activeElement!==element)element.value=value;}
function setTab(next,focus=false){tab=next;render();if(focus)$(next+'-tab').focus();}
function selectItem(id,focus=false){
 selectedId=id;const index=session.project.items.findIndex(item=>item.id===id);
 if(index>=0)pageIndex=Math.floor(index/(session.project.settings.columns*session.project.settings.rows));
 tab='product';render();
 if(focus)document.querySelector(`[data-item-id="${id}"]`)?.focus({preventScroll:true});
}
function buildSequence(){
 const focused=document.activeElement?.dataset?.itemId;
 const fragment=document.createDocumentFragment();
 session.project.items.forEach((item,index)=>{
  const li=document.createElement('li'),button=document.createElement('button'),thumb=document.createElement('span'),image=document.createElement('img'),position=document.createElement('span'),caption=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
  button.className='product-card';button.dataset.itemId=item.id;button.type='button';button.disabled=busy();button.setAttribute('aria-pressed',String(item.id===selectedId));
  button.setAttribute('aria-label',`Editar produto ${index+1}: ${item.name||item.fileName}${priceDrafts.has(item.id)?', preço pendente':''}`);
  image.src=item.png;image.alt='';image.width=138;image.height=88;image.loading='lazy';image.decoding='async';
  image.style.transform=`rotate(${item.rotation}deg)`;
  position.className='position';position.textContent=String(index+1).padStart(2,'0');caption.className='card-caption';
  name.textContent=item.name||item.fileName;detail.textContent=priceDrafts.has(item.id)?'Corrigir preço':item.reference||'Sem referência';
  caption.append(name,detail);thumb.className='thumb';thumb.append(image);button.append(thumb,position,caption);button.addEventListener('click',()=>selectItem(item.id,true));li.append(button);fragment.append(li);
 });
 if(!session.project.items.length){const li=document.createElement('li');li.className='empty-sequence';li.textContent='As fotos adicionadas formam a sequência do catálogo.';fragment.append(li);}
 $('product-sequence').replaceChildren(fragment);
 if(focused)document.querySelector(`[data-item-id="${focused}"]`)?.focus({preventScroll:true});
}
function render(){
 const project=session.project,stats=projectStats(project),plan=planPages(project),settings=project.settings;
 if(!project.items.some(item=>item.id===selectedId))selectedId=project.items[0]?.id||null;
 pageIndex=Math.max(0,Math.min(pageIndex,plan.pages.length-1));
 $('catalog-summary').textContent=`${stats.items} ${stats.items===1?'produto':'produtos'} · ${stats.pages} ${stats.pages===1?'página':'páginas'}`;
 $('sample-badge').textContent=isDemo?'Exemplo fictício':'Catálogo em memória';$('sample-badge').classList.toggle('custom',!isDemo);
 $('paper-label').textContent=`${settings.paper==='a4'?'A4':'Carta'} · ${settings.orientation==='portrait'?'retrato':'paisagem'}`;
 $('page-label').textContent=stats.pages?`${pageIndex+1} de ${stats.pages}`:'Sem páginas';
 $('previous-page').disabled=!stats.pages||pageIndex===0;$('next-page').disabled=!stats.pages||pageIndex>=stats.pages-1;
 $('empty-state').hidden=!!stats.items;$('paper-wrap').hidden=!stats.items;paperDimensions={width:plan.width,height:plan.height};if(stats.items)fitPaper();
 const nextPreviewKey=`${session.revision}/${pageIndex}`;
 if(stats.items&&nextPreviewKey!==previewKey){
  const svg=toSvg(project,pageIndex),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),old=previewUrl;
  previewUrl=url;$('page-preview').src=url;$('page-preview').alt=`Prévia da página ${pageIndex+1} de ${stats.pages}, com ${plan.pages[pageIndex].slots.length} ${plan.pages[pageIndex].slots.length===1?'produto':'produtos'}.`;
  $('paper-wrap').style.aspectRatio=`${plan.width} / ${plan.height}`;
  $('open-preview').href=url;if(old)URL.revokeObjectURL(old);previewKey=nextPreviewKey;
 }
 if(!stats.items&&previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;$('page-preview').removeAttribute('src');previewKey='';}
 $('open-preview').hidden=!stats.items;
 const slot=plan.pages[pageIndex]?.slots.find(slot=>slot.itemId===selectedId);
 $('selection-frame').hidden=!slot;
 if(slot){const box=slot.frame,frame=$('selection-frame');frame.style.left=`${box.x/plan.width*100}%`;frame.style.top=`${box.y/plan.height*100}%`;frame.style.width=`${box.width/plan.width*100}%`;frame.style.height=`${box.height/plan.height*100}%`;}
 const selected=currentItem(),index=project.items.findIndex(item=>item.id===selectedId);
 $('product-form').hidden=!selected;$('product-empty').hidden=!!selected;
 $('product-heading').textContent=selected?'Editar produto':'Selecione um produto';$('product-position').textContent=selected?`${index+1} de ${stats.items}`:'';
 if(selected){
  fieldValue($('item-name'),selected.name);fieldValue($('item-reference'),selected.reference);fieldValue($('item-price'),priceDrafts.get(selected.id)??priceText(selected.priceMinor));
  $('item-price').setAttribute('aria-invalid',String(priceDrafts.has(selected.id)));
  $('item-file').textContent=selected.fileName;$('item-dimensions').textContent=`${selected.width} × ${selected.height} px · rotação ${selected.rotation}°`;
 }
 for(const [key,id] of Object.entries(settingControls)){const element=$(id);if(element.type==='checkbox')element.checked=settings[key];else fieldValue(element,String(settings[key]));}
 $('product-panel').hidden=tab!=='product';$('page-panel').hidden=tab!=='page';
 for(const name of ['product','page']){$(name+'-tab').setAttribute('aria-selected',String(tab===name));$(name+'-tab').tabIndex=tab===name?0:-1;}
 for(const element of document.querySelectorAll('[data-busy]'))element.disabled=busy();
 $('product-fields').disabled=busy();$('page-fields').disabled=busy();
 $('move-left').disabled=busy()||index<=0;$('move-right').disabled=busy()||index<0||index===stats.items-1;
 $('export-png').disabled=busy()||!stats.items||priceDrafts.size>0;$('export-svg').disabled=busy()||!stats.items||priceDrafts.size>0;$('save-project').disabled=busy()||priceDrafts.size>0;
 buildSequence();
}
function edit(transform,text){
 try{session.edit(transform);undoRemoval=null;if(text)message(text);return true;}catch(error){failure(error);return false;}
}
function requestReplacement(action,title){
 if(!session.project.items.length&&!priceDrafts.size&&JSON.stringify(session.project.settings)===JSON.stringify(newProject().settings)){action();return;}
 pendingReplacement=action;$('replace-title').textContent=title;$('replace-dialog').returnValue='';$('replace-dialog').showModal();
}
$('replace-dialog').addEventListener('close',()=>{const action=pendingReplacement;pendingReplacement=null;if($('replace-dialog').returnValue==='confirm')action?.();});
function clearProject(){selectedId=null;pageIndex=0;isDemo=false;priceDrafts.clear();undoRemoval=null;session.replace(newProject());message('Catálogo vazio. Adicione as fotos dos seus produtos.');}
async function loadDemo(){
 message('Preparando os seis produtos fictícios…','busy');
 try{const result=await session.run((_,current)=>makeDemo(current));if(result.applied){priceDrafts.clear();isDemo=true;selectedId=session.project.items[0]?.id;pageIndex=0;tab='product';undoRemoval=null;render();message('Exemplo fictício aberto. Edite os produtos ou comece um catálogo novo.');}}catch(error){failure(error);}
}
$('new-project').addEventListener('click',()=>requestReplacement(clearProject,'Começar um catálogo novo?'));
$('open-project').addEventListener('click',()=>requestReplacement(()=>$('project-input').click(),'Abrir outro projeto?'));
for(const id of ['add-images','empty-add'])$(id).addEventListener('click',()=>$('image-input').click());
for(const id of ['load-demo','empty-demo'])$(id).addEventListener('click',()=>requestReplacement(loadDemo,'Abrir o exemplo fictício?'));
$('image-input').addEventListener('change',async event=>{
 const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length)return;
 let firstAdded;
 try{
  const result=await session.run(async(initial,current)=>{
   if(initial.items.length+files.length>LIMITS.maxItems)throw new ProjectError('item_limit','Este catálogo aceita até 32 produtos. Remova alguns ou crie outro projeto.');
   let next=initial;
   for(let index=0;index<files.length;index++){
    if(!current())return initial;message(`Preparando foto ${index+1} de ${files.length}…`,'busy');
    const id=nextItemId(next),item=await normalizeLocalFile(files[index],id);if(index===0)firstAdded=id;next=appendItems(next,[item]);
   }
   return next;
  });
  if(result.applied){undoRemoval=null;selectItem(firstAdded);message(`${files.length} ${files.length===1?'foto adicionada':'fotos adicionadas'}. Complete os dados dos produtos.`);}
 }catch(error){failure(error);}
});
$('project-input').addEventListener('change',async event=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  const result=await session.run(async(initial,current)=>{
   message('Conferindo o projeto e suas imagens…','busy');
   if(file.size>LIMITS.maxProjectBytes)throw new ProjectError('project_size','O projeto ultrapassa o limite de 24 MiB.');
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(bytes.length>LIMITS.maxProjectBytes||bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)throw new ProjectError('project_encoding','Use um projeto JSON UTF-8 sem BOM, com até 24 MiB.');
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ProjectError('project_encoding','O projeto deve ser um arquivo JSON UTF-8 válido.');}
   const parsed=parseProjectText(text);
   for(const item of parsed.items){if(!current())return initial;await validateEmbeddedImages({...parsed,items:[item]});}
   return parsed;
  });
  if(result.applied){selectedId=session.project.items[0]?.id;pageIndex=0;isDemo=false;priceDrafts.clear();undoRemoval=null;render();message('Projeto aberto. As fotos e os dados foram conferidos antes de substituir o catálogo.');}
 }catch(error){failure(error);}
});
for(const name of ['product','page'])$(name+'-tab').addEventListener('click',()=>setTab(name));
for(const name of ['product','page'])$(name+'-tab').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setTab(event.key==='Home'?'product':event.key==='End'?'page':tab==='product'?'page':'product',true);}});
for(const id of ['product-form','page-form'])$(id).addEventListener('submit',event=>event.preventDefault());
$('item-name').addEventListener('input',event=>{if(selectedId&&!edit(p=>updateItem(p,selectedId,{name:event.target.value}))){event.target.value=currentItem().name;message('Nome inválido. O último texto válido foi mantido.','error');}});
$('item-reference').addEventListener('input',event=>{if(selectedId&&!edit(p=>updateItem(p,selectedId,{reference:event.target.value}))){event.target.value=currentItem().reference;message('Referência inválida. O último texto válido foi mantido.','error');}});
$('item-price').addEventListener('input',event=>{
 const id=selectedId;if(!id)return;
 try{const value=parsePrice(event.target.value);priceDrafts.delete(id);edit(p=>updateItem(p,id,{priceMinor:value}));event.target.setAttribute('aria-invalid','false');message('Preço atualizado na prévia.');}
 catch(error){priceDrafts.set(id,event.target.value);event.target.setAttribute('aria-invalid','true');render();message('Preço em edição. Use, por exemplo, 129,90 ou deixe o campo em branco.','error');}
});
$('item-price').addEventListener('blur',()=>{const item=currentItem();if(item&&!priceDrafts.has(item.id))$('item-price').value=priceText(item.priceMinor);});
$('rotate-item').addEventListener('click',()=>{const item=currentItem();if(item)edit(p=>updateItem(p,item.id,{rotation:(item.rotation+90)%360}),'Foto girada na folha.');});
for(const [id,delta]of [['move-left',-1],['move-right',1]])$(id).addEventListener('click',()=>{if(selectedId){edit(p=>moveItem(p,selectedId,delta),'Posição do produto atualizada.');selectItem(selectedId);}});
$('remove-item').addEventListener('click',()=>{
 const item=currentItem();if(!item)return;
 const before={project:session.project,id:item.id,pageIndex,isDemo,draft:priceDrafts.get(item.id)};
 const index=session.project.items.indexOf(item);priceDrafts.delete(item.id);session.edit(p=>removeItem(p,item.id));
 selectedId=session.project.items[Math.min(index,session.project.items.length-1)]?.id||null;render();undoRemoval={...before,revision:session.revision};
 message('Produto removido.');const undo=document.createElement('button');undo.className='text-button';undo.textContent='Desfazer';undo.style.marginLeft='9px';
 undo.addEventListener('click',()=>{if(!undoRemoval||session.revision!==undoRemoval.revision){message('O catálogo mudou depois da remoção.');return;}const saved=undoRemoval;undoRemoval=null;selectedId=saved.id;pageIndex=saved.pageIndex;isDemo=saved.isDemo;if(saved.draft!==undefined)priceDrafts.set(saved.id,saved.draft);session.replace(saved.project);message('Produto restaurado.');});$('status').append(undo);
});
for(const [key,id]of Object.entries(settingControls)){
 const element=$(id),eventType=element.tagName==='INPUT'&&element.type!=='checkbox'?'input':'change';
 element.addEventListener(eventType,()=>{const value=element.type==='checkbox'?element.checked:['columns','rows'].includes(key)?Number(element.value):element.value;const valid=edit(p=>updateSettings(p,{[key]:value}));if(!valid){element.value=String(session.project.settings[key]);message('Texto inválido. O último valor válido foi mantido.','error');}if(['columns','rows'].includes(key)&&selectedId){const index=session.project.items.findIndex(i=>i.id===selectedId);pageIndex=Math.floor(index/(session.project.settings.columns*session.project.settings.rows));render();}});
}
$('previous-page').addEventListener('click',()=>{pageIndex--;render();});$('next-page').addEventListener('click',()=>{pageIndex++;render();});
function download(blob,fileName){
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;document.body.append(anchor);
 try{anchor.click();}finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
}
$('save-project').addEventListener('click',()=>{try{download(new Blob([stringifyProject(session.project)],{type:'application/json;charset=utf-8'}),'folha-de-contato.json');message('Download do projeto solicitado. Guarde o JSON para continuar a edição depois.');}catch(error){failure(error);}});
$('export-svg').addEventListener('click',()=>{try{download(new Blob([toSvg(session.project,pageIndex)],{type:'image/svg+xml;charset=utf-8'}),`catalogo-pagina-${String(pageIndex+1).padStart(2,'0')}.svg`);message('Download do SVG da página atual solicitado. As imagens estão embutidas.');}catch(error){failure(error);}});
$('export-png').addEventListener('click',async()=>{
 const revision=session.revision,page=pageIndex,project=session.project;
 exporting=true;render();message('Preparando PNG da página atual…','busy');
 try{const plan=planPages(project),blob=await rasterizeSvg(toSvg(project,page),plan.width,plan.height);if(session.revision===revision){download(blob,`catalogo-pagina-${String(page+1).padStart(2,'0')}.png`);message('Download do PNG da página atual solicitado.');}}
 catch(error){if(session.revision===revision)failure(error);}finally{exporting=false;render();}
});
window.addEventListener('pagehide',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);});
session.subscribe(render);render();loadDemo();
