import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('dist/build-manifest.json','utf8'));
for(const [name,hash]of Object.entries(manifest.files)){
 const bytes=await readFile(`dist/${name}`);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name);
 assert.equal(createHash('sha256').update(await readFile(name)).digest('hex'),hash,name);
 if(/\.(?:html|mjs|css|md|txt)$/.test(name)){
  const text=bytes.toString('utf8');
  assert(!/github_pat_[A-Za-z0-9_]{25,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),`Credencial em ${name}`);
  assert(!/\/(?:home|Users)\/[\w.-]+\//.test(text),`Caminho pessoal em ${name}`);
 }
}
const html=await readFile('dist/index.html','utf8');
assert(html.includes('e394078f'),'Contrato visual precisa estar no HTML emitido.');
assert(!html.includes('<script>'),'Scripts precisam ser módulos externos para CSP.');
assert.equal((await readdir('dist')).includes('.nojekyll'),true);
console.log(JSON.stringify({staticFilesChecked:Object.keys(manifest.files).length,sourceBytesMatch:true,visualContractPreserved:true}));
