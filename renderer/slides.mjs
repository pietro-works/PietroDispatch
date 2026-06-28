#!/usr/bin/env node
/**
 * slides.mjs — render Pietro.works slide decks through slides.html, headless, at 2160,
 * then stitch the slides into a square LinkedIn-ready PDF. Same CDP + static-server
 * approach as news.mjs; the difference is per-slide card types (A/B/C/contact) injected
 * by calling the template's renderSlide(slide, topic), and a printToPDF pass at the end.
 *
 * Usage:
 *   node renderer/slides.mjs --deck work/<date>/slides.json --root work/<date> --out work/<date>/slides [--pdf work/<date>/slides.pdf] [--chrome <path>]
 *
 * slides.json: { "topic": "FILENAME.MD", "slides": [ { "id":"01", "type":"A", ...fields, "bg":"backgrounds/bg-01.png" }, ... ] }
 *   For type C use "bgTop" and "bgBot" instead of "bg". bg paths are relative to --root.
 *   Missing backgrounds fall back to the template's brand placeholder.
 */
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile, access } from 'node:fs/promises';
import { createReadStream, constants as FS } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RENDERER_DIR = dirname(fileURLToPath(import.meta.url));
const SIDE = 1080;
const OUT_SIDE = 2160;

function parseArgs() {
  const a = process.argv.slice(2); const o = { deck: null, root: null, out: null, pdf: null, chrome: null };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--deck') o.deck = a[++i];
    else if (a[i] === '--root') o.root = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--pdf') o.pdf = a[++i];
    else if (a[i] === '--chrome') o.chrome = a[++i];
    else throw new Error(`Unknown argument: ${a[i]}`);
  }
  if (!o.deck || !o.root || !o.out) throw new Error('Required: --deck, --root, --out');
  if (!o.pdf) o.pdf = join(o.out, 'slides.pdf');
  return o;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function mimeType(p){const e=extname(p).toLowerCase();return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.jpg':'image/jpeg','.jpeg':'image/jpeg'})[e]||'application/octet-stream';}
async function startStaticServer(root){
  const server=createServer(async(req,res)=>{ try{
    const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const path=resolve(root,`.${rel==='/'?'/index.html':rel}`);
    if(!path.startsWith(root)){res.writeHead(403);res.end();return;}
    const info=await stat(path); if(!info.isFile()) throw new Error('nf');
    res.writeHead(200,{'Content-Type':mimeType(path),'Content-Length':info.size}); createReadStream(path).pipe(res);
  }catch{res.writeHead(404);res.end();} });
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); return {server,port:server.address().port};
}
async function exists(p){try{await access(p,FS.X_OK);return true;}catch{return false;}}
async function resolveChrome(x){ if(x)return x; if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
  for(const c of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/snap/bin/chromium']) if(await exists(c))return c; return 'google-chrome'; }
class Cdp{
  constructor(wsUrl){this.ws=new WebSocket(wsUrl);this.id=1;this.pending=new Map();this.listeners=new Map();
    this.ready=new Promise((res,rej)=>{this.ws.addEventListener('open',res,{once:true});this.ws.addEventListener('error',rej,{once:true});});
    this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
      if(m.id&&this.pending.has(m.id)){const{res,rej,timer}=this.pending.get(m.id);clearTimeout(timer);this.pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result||{});}
      else if(m.method&&this.listeners.has(m.method)){for(const l of this.listeners.get(m.method))l(m);}});}
  async call(method,params={},sessionId){await this.ready;const id=this.id++;const payload={id,method,params};if(sessionId)payload.sessionId=sessionId;
    const p=new Promise((res,rej)=>{const timer=setTimeout(()=>{this.pending.delete(id);rej(new Error('CDP timeout: '+method));},60000);this.pending.set(id,{res,rej,timer});});
    this.ws.send(JSON.stringify(payload));return p;}
  once(method,sessionId){return new Promise(res=>{const l=m=>{if(sessionId&&m.sessionId!==sessionId)return;const arr=this.listeners.get(method)||[];this.listeners.set(method,arr.filter(x=>x!==l));res(m.params||{});};const arr=this.listeners.get(method)||[];arr.push(l);this.listeners.set(method,arr);});}
}
async function launchChrome(bin){
  const userDataDir=await mkdtemp(join(tmpdir(),'pietro-slides-chrome-'));
  const proc=spawn(bin,['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${userDataDir}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let stderr='';proc.stderr.on('data',c=>{stderr+=c.toString();});
  const portFile=join(userDataDir,'DevToolsActivePort');let port=null;
  for(let i=0;i<100;i+=1){try{port=Number((await readFile(portFile,'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  if(!port){proc.kill('SIGKILL');throw new Error('Chrome gave no DevTools port. Is "'+bin+'" Chrome?\n'+stderr.slice(0,500));}
  const ver=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return {proc,userDataDir,wsUrl:ver.webSocketDebuggerUrl};
}
async function attach(cdp,url,scale){
  const{targetId}=await cdp.call('Target.createTarget',{url:'about:blank'});
  const{sessionId}=await cdp.call('Target.attachToTarget',{targetId,flatten:true});
  const page=(m,p={})=>cdp.call(m,p,sessionId);
  await page('Page.enable');await page('Runtime.enable');
  if(scale)await page('Emulation.setDeviceMetricsOverride',{width:SIDE,height:SIDE,deviceScaleFactor:2,mobile:false,scale:1});
  const load=cdp.once('Page.loadEventFired',sessionId); await page('Page.navigate',{url}); await load;
  await page('Runtime.evaluate',{expression:`(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,300));})()`,awaitPromise:true});
  return page;
}
async function dataUrl(p){const b=await readFile(p);return 'data:image/png;base64,'+b.toString('base64');}
async function shoot(page,outPath){
  const b=await page('Runtime.evaluate',{expression:`(()=>{const r=document.getElementById('slide').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`,returnByValue:true});
  const{x,y,width,height}=b.result.value;
  const shot=await page('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,clip:{x,y,width,height,scale:1}});
  const buf=Buffer.from(shot.data,'base64');
  const w=buf.readUInt32BE(16),h=buf.readUInt32BE(20);
  if(w!==OUT_SIDE||h!==OUT_SIDE)throw new Error(`${basename(outPath)} is ${w}x${h}, expected ${OUT_SIDE}`);
  await writeFile(outPath,buf);
}
async function main(){
  const o=parseArgs();
  const deck=JSON.parse(await readFile(o.deck,'utf8'));
  await mkdir(o.out,{recursive:true});
  const bin=await resolveChrome(o.chrome);
  const {server,port}=await startStaticServer(RENDERER_DIR);
  const chrome=await launchChrome(bin); const cdp=new Cdp(chrome.wsUrl);
  try{
    const page=await attach(cdp,`http://127.0.0.1:${port}/slides.html`,true);
    for(const sl of deck.slides){
      const s={...sl};
      if(s.bg) s.bg=await dataUrl(join(o.root,s.bg));
      if(s.bgTop) s.bgTop=await dataUrl(join(o.root,s.bgTop));
      if(s.bgBot) s.bgBot=await dataUrl(join(o.root,s.bgBot));
      await page('Runtime.evaluate',{expression:`window.renderSlide(${JSON.stringify(s)}, ${JSON.stringify(deck.topic||'')})`});
      await page('Runtime.evaluate',{expression:`(async()=>{
        await document.fonts.ready;
        const els=[...document.querySelectorAll('.s-photo,.s-half'),...document.querySelectorAll('img')];
        const urls=[];
        for(const e of els){ if(e.tagName==='IMG'){ if(e.src) urls.push(e.src); } else { const m=getComputedStyle(e).backgroundImage.match(/url\\(["']?([^"')]+)["']?\\)/); if(m) urls.push(m[1]); } }
        await Promise.all(urls.map(u=>new Promise(r=>{const i=new Image();i.onload=i.onerror=r;i.src=u;})));
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      })()`,awaitPromise:true});
      const out=join(o.out,`post-${s.id}.png`); await shoot(page,out); console.log('wrote '+basename(out));
    }
    // stitch a square PDF from the rendered slides, via the same Chrome
    const imgs=deck.slides.map(s=>`post-${s.id}.png`);
    const pdfHtml=`<!doctype html><meta charset=utf-8><style>@page{size:1080px 1080px;margin:0}*{margin:0}img{width:1080px;height:1080px;display:block;page-break-after:always}</style>`+imgs.map(f=>`<img src="${f}">`).join('');
    await writeFile(join(o.out,'_pdf.html'),pdfHtml);
    const {server:s2,port:p2}=await startStaticServer(o.out);
    try{
      const pp=await attach(cdp,`http://127.0.0.1:${p2}/_pdf.html`,false);
      await pp('Runtime.evaluate',{expression:`(async()=>{await Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;})));await new Promise(r=>setTimeout(r,200));})()`,awaitPromise:true});
      const pdf=await pp('Page.printToPDF',{paperWidth:11.25,paperHeight:11.25,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,printBackground:true,preferCSSPageSize:true});
      await writeFile(o.pdf,Buffer.from(pdf.data,'base64'));
      console.log('wrote '+basename(o.pdf)+` (${imgs.length} pages)`);
    } finally { await rm(join(o.out,'_pdf.html'),{force:true}); await new Promise(r=>s2.close(r)); }
  } finally {
    try{await cdp.call('Browser.close');}catch{}
    await new Promise(r=>{const t=setTimeout(()=>{try{chrome.proc.kill('SIGKILL');}catch{}r();},3000);chrome.proc.once('exit',()=>{clearTimeout(t);r();});});
    await rm(chrome.userDataDir,{recursive:true,force:true}); await new Promise(r=>server.close(r));
  }
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
