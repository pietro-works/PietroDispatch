#!/usr/bin/env node
/**
 * fluxogram.mjs — render the reusable fluxogram template (renderer/fluxogram.html) to a webp,
 * headless, at 2x, then downscale for a crisp asset. Same CDP + static-server approach as the
 * other renderers. Edit renderer/fluxogram.html (cards, glyphs, copy, background) and re-run this
 * to regenerate the diagram used in the README and docs.
 *
 * Usage:
 *   node renderer/fluxogram.mjs [--data spec.json] [--out out.webp] [--format png|webp] [--width 1600] [--chrome <path>]
 *
 * Without --data it renders the default content pipeline (docs/assets/pipeline.webp). With --data it
 * injects a fluxo spec (see renderFluxo in fluxogram.html): { kick, flow, cards[], footL, footR, bg }.
 * spec.bg is an image path (absolute or relative to the spec file); it is inlined as a data URL.
 * The template is 1600x548 CSS px, renders at deviceScaleFactor 2, and is written to --out at --width.
 */
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir, access } from 'node:fs/promises';
import { createReadStream, constants as FS } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RENDERER_DIR = dirname(fileURLToPath(import.meta.url));
const PAGE = 'fluxogram.html';
const CSS_W = 1600, CSS_H = 548;

function parseArgs() {
  const a = process.argv.slice(2); const o = { out: resolve(RENDERER_DIR, '../docs/assets/pipeline.webp'), width: 1600, chrome: null, data: null, format: null };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--out') o.out = resolve(a[++i]);
    else if (a[i] === '--width') o.width = Number(a[++i]);
    else if (a[i] === '--chrome') o.chrome = a[++i];
    else if (a[i] === '--data') o.data = resolve(a[++i]);
    else if (a[i] === '--format') o.format = a[++i];
    else throw new Error(`Unknown argument: ${a[i]}`);
  }
  if (!o.format) o.format = (extname(o.out).slice(1) || 'webp').toLowerCase();
  return o;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mime(p) {
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[extname(p).toLowerCase()] || 'application/octet-stream';
}
async function startServer(root) {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const path = resolve(root, `.${rel}`);
      if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const info = await stat(path); if (!info.isFile()) throw new Error('nf');
      res.writeHead(200, { 'Content-Type': mime(path), 'Content-Length': info.size }); createReadStream(path).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}
async function exists(p) { try { await access(p, FS.X_OK); return true; } catch { return false; } }
async function resolveChrome(x) {
  if (x) return x; if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const c of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']) if (await exists(c)) return c;
  return 'google-chrome';
}
class Cdp {
  constructor(ws) { this.ws = new WebSocket(ws); this.id = 1; this.pending = new Map();
    this.ready = new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
    this.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && this.pending.has(m.id)) { const { res, rej, t } = this.pending.get(m.id); clearTimeout(t); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result || {}); } }); }
  async call(method, params = {}, sessionId) { await this.ready; const id = this.id++; const p = { id, method, params }; if (sessionId) p.sessionId = sessionId;
    const pr = new Promise((res, rej) => { const t = setTimeout(() => { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); }, 60000); this.pending.set(id, { res, rej, t }); });
    this.ws.send(JSON.stringify(p)); return pr; }
  once(method, sid) { return new Promise((res) => { const l = (e) => { const m = JSON.parse(e.data); if (m.method === method && (!sid || m.sessionId === sid)) { this.ws.removeEventListener('message', l); res(m.params || {}); } }; this.ws.addEventListener('message', l); }); }
}
async function launchChrome(bin) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'pietro-pipeline-'));
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; proc.stderr.on('data', (c) => { stderr += c.toString(); });
  const portFile = join(userDataDir, 'DevToolsActivePort'); let port = null;
  for (let i = 0; i < 100; i += 1) { try { port = Number((await readFile(portFile, 'utf8')).split('\n')[0]); break; } catch { await sleep(100); } }
  if (!port) { proc.kill('SIGKILL'); throw new Error('Chrome gave no DevTools port. Is "' + bin + '" Chrome?\n' + stderr.slice(0, 400)); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return { proc, userDataDir, wsUrl: ver.webSocketDebuggerUrl };
}

async function main() {
  const o = parseArgs();
  await mkdir(dirname(o.out), { recursive: true });
  const bin = await resolveChrome(o.chrome);
  const { server, port } = await startServer(RENDERER_DIR);
  const chrome = await launchChrome(bin);
  const cdp = new Cdp(chrome.wsUrl);
  try {
    const { targetId } = await cdp.call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });
    const page = (m, p = {}) => cdp.call(m, p, sessionId);
    await page('Page.enable'); await page('Runtime.enable');
    await page('Emulation.setDeviceMetricsOverride', { width: CSS_W, height: CSS_H, deviceScaleFactor: 2, mobile: false });
    const load = cdp.once('Page.loadEventFired', sessionId);
    await page('Page.navigate', { url: `http://127.0.0.1:${port}/${PAGE}` }); await load;
    if (o.data) {
      const spec = JSON.parse(await readFile(o.data, 'utf8'));
      if (spec.bg) {
        const bgPath = resolve(dirname(o.data), spec.bg);
        const buf = await readFile(bgPath);
        const ext = extname(bgPath).slice(1).toLowerCase();
        spec.bgUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`;
        delete spec.bg;
      }
      await page('Runtime.evaluate', { expression: `window.__FLUXO=${JSON.stringify(spec)};renderFluxo(window.__FLUXO);` });
    }
    await page('Runtime.evaluate', { expression: `(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,600));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`, awaitPromise: true });
    const b = await page('Runtime.evaluate', { expression: `(()=>{const r=document.getElementById('diagram').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`, returnByValue: true });
    const { x, y, width, height } = b.result.value;
    const shot = await page('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { x, y, width, height, scale: 1 } });
    const png = Buffer.from(shot.data, 'base64');
    const pipe = sharp(png).resize({ width: o.width });
    if (o.format === 'png') await pipe.png({ compressionLevel: 9 }).toFile(o.out);
    else await pipe.webp({ quality: 88, effort: 6 }).toFile(o.out);
    const meta = await sharp(o.out).metadata();
    console.log(`wrote ${o.out} (${meta.width}x${meta.height} ${o.format})`);
  } finally {
    try { await cdp.call('Browser.close'); } catch {}
    await new Promise((r) => { const t = setTimeout(() => { try { chrome.proc.kill('SIGKILL'); } catch {} r(); }, 3000); chrome.proc.once('exit', () => { clearTimeout(t); r(); }); });
    await rm(chrome.userDataDir, { recursive: true, force: true }); await new Promise((r) => server.close(r));
  }
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
