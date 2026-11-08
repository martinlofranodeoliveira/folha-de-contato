import {createServer} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const port=Number(process.argv[2]||4178);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Escolha uma porta de 1024 a 65535.');
const root=await realpath(resolve('dist'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.md':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const pieces=pathname.split('/');
  if(pieces.some(p=>p.startsWith('.')||p.includes('\\')||p.includes('\0'))){res.writeHead(404);res.end();return;}
  const path=await realpath(resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname)));
  if(!path.startsWith(root+sep)||!(await stat(path)).isFile()){res.writeHead(404);res.end();return;}
  const bytes=await readFile(path);
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/`));
