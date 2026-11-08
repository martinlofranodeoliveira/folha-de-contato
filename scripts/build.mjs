import {mkdir, readFile, writeFile, cp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files = ['index.html','styles.css','src/app.mjs','src/model.mjs','src/layout.mjs','src/svg.mjs','src/image-io.mjs','src/demo.mjs','src/operations.mjs','assets/demo-products.png','assets/lato-regular.ttf','assets/lato-bold.ttf','assets/LATO-LICENSE.txt','assets/favicon.svg','LICENSE','THIRD_PARTY_NOTICES.md','assets/DEMO.md'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
const manifest={version:1,files:{}};
for(const file of files){
  await mkdir(`dist/${file.split('/').slice(0,-1).join('/')}`,{recursive:true});
  await cp(file,`dist/${file}`);
  manifest.files[file]=createHash('sha256').update(await readFile(file)).digest('hex');
}
await writeFile('dist/.nojekyll','');
await writeFile('dist/build-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({staticFiles:files.length+2,version:'1.0.0'}));
