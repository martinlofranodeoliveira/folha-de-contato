import {newProject,appendItems,updateSettings,updateItem,nextItemId,ProjectError} from './model.mjs';
import {normalizeLocalFile} from './image-io.mjs';
const products=[
 ['Vaso Canto','OBJ-001',12900],
 ['Luminária Arco','LUZ-002',28900],
 ['Dupla de xícaras','MESA-003',8900],
 ['Caderno de linho','PAP-004',null],
 ['Bolsa Trama','TRM-005',7900],
 ['Prato Oliva','MESA-006',6900]
];
export async function makeDemo(isCurrent=()=>true){
 let project=updateSettings(newProject(),{title:'Objetos para o dia a dia',subtitle:'Coleção fictícia · referências e preços de demonstração',columns:2,rows:3});
 const image=new Image();
 image.src=new URL('../assets/demo-products.png',import.meta.url).href;
 try{
  await image.decode();
  for(let index=0;index<products.length;index++){
   if(!isCurrent())return project;
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
   const context=canvas.getContext('2d');
   if(!context)throw new ProjectError('canvas','Este navegador não disponibilizou a área de desenho.');
   context.drawImage(image,(index%3)*512,Math.floor(index/3)*512,512,512,0,0,512,512);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new ProjectError('encode','Não foi possível preparar o exemplo.')),'image/png'));
   const id=nextItemId(project),[name,reference,priceMinor]=products[index];
   const item=await normalizeLocalFile(new File([blob],`produto-${index+1}.png`,{type:'image/png'}),id);
   project=appendItems(project,[item]);
   project=updateItem(project,id,{name,reference,priceMinor});
   canvas.width=0;canvas.height=0;
  }
  return project;
 }finally{image.src='';}
}
