#!/usr/bin/env node
/**
 * tutorial.mjs — render the Pietro tutorial card (tutorial.html) headless to a 2160 PNG.
 *
 * The tutorial template has no server-side render path; it exports in the browser via the
 * html-to-image library and a "download PNG" button (pixelRatio 2 -> 2160). This driver
 * serves the template over HTTP (html-to-image refuses file://), injects a spec into the
 * page's global `state`, calls the template's own render(), then runs the same html-to-image
 * export and writes the PNG. Same CDP + static-server approach as the news/slides renderers.
 *
 * Usage:
 *   node render.mjs --spec <spec.json> --root <dir> --out <out.png> [--chrome <path>]
 *
 * spec.json: {
 *   top, bot, size:'s'|'m'|'l', shape:'rect'|'circle', radius, hsize, scrim, blur,
 *   bg: "<path rel to root>",
 *   text: { tbLeft, tbRight, eyebrow, headline(html with <span class=accent>), idName, idRole, idCta },
 *   cells: [ { key:"0-0", img:"<path rel to root>", num, name, sub }, ... ]
 * }
 */
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile, access } from 'node:fs/promises';
import { createReadStream, constants as FS } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_SIDE = 2160;

function parseArgs() {
  const a = process.argv.slice(2); const o = { spec: null, root: null, out: null, chrome: null };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--spec') o.spec = a[++i];
    else if (a[i] === '--root') o.root = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--chrome') o.chrome = a[++i];
    else throw new Error(`Unknown argument: ${a[i]}`);
  }
  if (!o.spec || !o.root || !o.out) throw new Error('Required: --spec, --root, --out');
  return o;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mimeType(p) { const e = extname(p).toLowerCase(); return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[e] || 'application/octet-stream'; }
async function startStaticServer(root) {
  const server = createServer(async (req, res) => { try {
    const rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const path = resolve(root, `.${rel === '/' ? '/tutorial.html' : rel}`);
    if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const info = await stat(path); if (!info.isFile()) throw new Error('nf');
    res.writeHead(200, { 'Content-Type': mimeType(path), 'Content-Length': info.size }); createReadStream(path).pipe(res);
  } catch { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); return { server, port: server.address().port };
}
async function exists(p) { try { await access(p, FS.X_OK); return true; } catch { return false; } }
async function resolveChrome(x) { if (x) return x; if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const c of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium']) if (await exists(c)) return c; return 'google-chrome'; }

class Cdp {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 1; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
    this.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej, timer } = this.pending.get(m.id); clearTimeout(timer); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result || {}); }
      else if (m.method && this.listeners.has(m.method)) { for (const l of this.listeners.get(m.method)) l(m); } }); }
  async call(method, params = {}, sessionId) { await this.ready; const id = this.id++; const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
    const p = new Promise((res, rej) => { const timer = setTimeout(() => { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); }, 120000); this.pending.set(id, { res, rej, timer }); });
    this.ws.send(JSON.stringify(payload)); return p; }
  once(method, sessionId) { return new Promise((res) => { const l = (m) => { if (sessionId && m.sessionId !== sessionId) return; const arr = this.listeners.get(method) || []; this.listeners.set(method, arr.filter((x) => x !== l)); res(m.params || {}); }; const arr = this.listeners.get(method) || []; arr.push(l); this.listeners.set(method, arr); }); }
}
async function launchChrome(bin) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'pietro-tut-chrome-'));
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; proc.stderr.on('data', (c) => { stderr += c.toString(); });
  const portFile = join(userDataDir, 'DevToolsActivePort'); let port = null;
  for (let i = 0; i < 100; i += 1) { try { port = Number((await readFile(portFile, 'utf8')).split('\n')[0]); break; } catch { await sleep(100); } }
  if (!port) { proc.kill('SIGKILL'); throw new Error('Chrome gave no DevTools port.\n' + stderr.slice(0, 500)); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return { proc, userDataDir, wsUrl: ver.webSocketDebuggerUrl };
}
async function attach(cdp, url) {
  const { targetId } = await cdp.call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });
  const page = (m, p = {}) => cdp.call(m, p, sessionId);
  await page('Page.enable'); await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1200, deviceScaleFactor: 1, mobile: false });
  const load = cdp.once('Page.loadEventFired', sessionId); await page('Page.navigate', { url }); await load;
  return page;
}
async function evalP(page, expression) {
  const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate failed');
  return r.result?.value;
}
async function dataUrl(p) { const b = await readFile(p); return 'data:image/png;base64,' + b.toString('base64'); }
async function pngSize(p) {
  const b = await readFile(p);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${basename(p)} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

async function main() {
  const o = parseArgs();
  const spec = JSON.parse(await readFile(o.spec, 'utf8'));
  const root = resolve(o.root);

  // resolve images to dataURLs + natural sizes
  const bgUrl = spec.bg ? await dataUrl(join(root, spec.bg)) : '';
  const cells = [];
  for (const c of (spec.cells || [])) {
    const p = join(root, c.img); const sz = await pngSize(p);
    cells.push({ key: c.key, url: await dataUrl(p), w: sz.w, h: sz.h, num: c.num || '', name: c.name || '', sub: c.sub || '' });
  }

  const bin = await resolveChrome(o.chrome);
  const { server, port } = await startStaticServer(TEMPLATE_DIR);
  const chrome = await launchChrome(bin); const cdp = new Cdp(chrome.wsUrl);
  try {
    const page = await attach(cdp, `http://127.0.0.1:${port}/tutorial.html`);
    // wait for the template's globals + the html-to-image lib + fonts
    await evalP(page, `(async()=>{ for(let i=0;i<200 && (typeof render!=='function' || typeof htmlToImage==='undefined'); i++){ await new Promise(r=>setTimeout(r,50)); } await (document.fonts?document.fonts.ready:Promise.resolve()); })()`);

    const inject = {
      top: spec.top, bot: spec.bot, size: spec.size || 's', shape: spec.shape || 'rect',
      radius: spec.radius != null ? spec.radius : 16, hsize: spec.hsize || 52,
      scrim: spec.scrim != null ? spec.scrim : 60, blur: spec.blur != null ? spec.blur : 0,
      text: spec.text || {}, bg: bgUrl, cells,
    };
    await evalP(page, `(() => {
      const s = ${JSON.stringify(inject)};
      state.top = s.top; state.bot = s.bot; state.size = s.size; state.shape = s.shape;
      state.radius = s.radius; state.hsize = s.hsize; state.scrim = s.scrim; state.blur = s.blur;
      state.images = {}; state.cap = {}; state.dim = {}; state.tf = {};
      for (const c of s.cells) { state.images[c.key] = c.url; state.dim[c.key] = { w: c.w, h: c.h }; state.tf[c.key] = { z: 1, px: 0, py: 0 }; state.cap[c.key] = { num: c.num, name: c.name, sub: c.sub }; }
      state.text = s.text;
      if (typeof restoreText === 'function') restoreText();
      const hl = document.getElementById('headline'); if (hl) hl.style.fontSize = s.hsize + 'px';
      if (s.bg && typeof setBackground === 'function') setBackground(s.bg);
      if (typeof applyBackdropVars === 'function') applyBackdropVars();
      if (typeof refreshSegs === 'function') refreshSegs();
      if (typeof refreshShape === 'function') refreshShape();
      if (typeof refreshPhotoSize === 'function') refreshPhotoSize();
      render();
      return true;
    })()`);

    // wait for every image in the card to finish loading
    await evalP(page, `(async()=>{ const imgs=[...document.querySelectorAll('#tut img')]; await Promise.all(imgs.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;}))); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); await new Promise(r=>setTimeout(r,250)); })()`);

    // run the template's own export path (exporting class hides edit chrome), return a dataURL
    const out = await evalP(page, `(async()=>{
      const node = document.getElementById('tut');
      node.classList.add('exporting');
      const canvas = await htmlToImage.toCanvas(node, { width: 1080, height: 1080, pixelRatio: 2, cacheBust: false, style: { transform: 'none' } });
      node.classList.remove('exporting');
      return canvas.toDataURL('image/png');
    })()`);
    if (!out || !out.startsWith('data:image/png')) throw new Error('export did not return a PNG dataURL');
    const buf = Buffer.from(out.split(',')[1], 'base64');
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (w !== OUT_SIDE || h !== OUT_SIDE) throw new Error(`export is ${w}x${h}, expected ${OUT_SIDE}`);
    await writeFile(o.out, buf);
    console.log(`wrote ${basename(o.out)} (${w}x${h})`);
  } finally {
    try { await cdp.call('Browser.close'); } catch {}
    await new Promise((r) => { const t = setTimeout(() => { try { chrome.proc.kill('SIGKILL'); } catch {} r(); }, 3000); chrome.proc.once('exit', () => { clearTimeout(t); r(); }); });
    await rm(chrome.userDataDir, { recursive: true, force: true }); await new Promise((r) => server.close(r));
  }
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
