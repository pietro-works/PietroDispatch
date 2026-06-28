#!/usr/bin/env node
/**
 * news.mjs — render Pietro Dispatch cards through news.html, headless, at 2160.
 *
 * Adapted from tools/export-quote-images.mjs (the quote exporter). Same approach:
 * a local static server for the template and its assets, headless Chrome driven
 * over CDP at deviceScaleFactor 2, an element-clip screenshot validated to 2160.
 * Differences: news selectors, and each card's fields and background are injected
 * directly by calling the template's own functions, since the news template never
 * had a background step.
 *
 * Usage:
 *   node renderer/news.mjs --cards work/<date>/cards.json --root work/<date> --out work/<date>/cards [--chrome <path>]
 *
 * cards.json: [{ id, category, headline, highlight, summary, bg }]
 *   bg is a path relative to --root, e.g. "backgrounds/bg-01-1.png".
 *
 * Chrome is resolved from --chrome, then CHROME_BIN, then common locations.
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
  const a = process.argv.slice(2);
  const o = { cards: null, root: null, out: null, chrome: null };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--cards') o.cards = a[++i];
    else if (a[i] === '--root') o.root = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--chrome') o.chrome = a[++i];
    else throw new Error(`Unknown argument: ${a[i]}`);
  }
  if (!o.cards || !o.root || !o.out) throw new Error('Required: --cards, --root, --out');
  return o;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// mirror news.html render(): escape headline, wrap the exact highlight substring
function headlineHtml(headline, highlight) {
  let html = escapeHtml(headline);
  if (highlight) {
    const esc = escapeHtml(highlight);
    html = html.replace(esc, `<span class="hl">${esc}</span>`);
  }
  return html;
}

function mimeType(p) {
  const e = extname(p).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.tsv': 'text/tab-separated-values; charset=utf-8', '.png': 'image/png',
    '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  })[e] || 'application/octet-stream';
}

async function startStaticServer(root) {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const path = resolve(root, `.${rel === '/' ? '/news.html' : rel}`);
      if (!path.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'Content-Type': mimeType(path), 'Content-Length': info.size });
      createReadStream(path).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

async function exists(p) { try { await access(p, FS.X_OK); return true; } catch { return false; } }

async function resolveChrome(explicit) {
  if (explicit) return explicit;
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  ];
  for (const c of candidates) if (await exists(c)) return c;
  return 'google-chrome'; // last resort, rely on PATH
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 1; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
    this.ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej, timer } = this.pending.get(m.id); clearTimeout(timer); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result || {});
      } else if (m.method && this.listeners.has(m.method)) {
        for (const l of this.listeners.get(m.method)) l(m);
      }
    });
  }
  async call(method, params = {}, sessionId) {
    await this.ready; const id = this.id++; const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
    const p = new Promise((res, rej) => { const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 60000); this.pending.set(id, { res, rej, timer }); });
    this.ws.send(JSON.stringify(payload)); return p;
  }
  once(method, sessionId) {
    return new Promise((res) => {
      const l = (m) => { if (sessionId && m.sessionId !== sessionId) return; const arr = this.listeners.get(method) || []; this.listeners.set(method, arr.filter((x) => x !== l)); res(m.params || {}); };
      const arr = this.listeners.get(method) || []; arr.push(l); this.listeners.set(method, arr);
    });
  }
}

async function launchChrome(bin) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'pietro-news-chrome-'));
  const proc = spawn(bin, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; proc.stderr.on('data', (c) => { stderr += c.toString(); });
  const portFile = join(userDataDir, 'DevToolsActivePort'); let port = null;
  for (let i = 0; i < 100; i += 1) {
    try { port = Number((await readFile(portFile, 'utf8')).split('\n')[0]); break; } catch { await sleep(100); }
  }
  if (!port) { proc.kill('SIGKILL'); throw new Error(`Chrome gave no DevTools port. Is "${bin}" a Chrome binary?\n${stderr.slice(0, 500)}`); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return { proc, userDataDir, wsUrl: ver.webSocketDebuggerUrl };
}

async function newPage(cdp, url) {
  const { targetId } = await cdp.call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });
  const page = (m, p = {}) => cdp.call(m, p, sessionId);
  await page('Page.enable'); await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', { width: SIDE, height: SIDE, deviceScaleFactor: 2, mobile: false, scale: 1 });
  const load = cdp.once('Page.loadEventFired', sessionId);
  await page('Page.navigate', { url });
  await load;
  // let the template's own loadTSV settle (it reads the header-only news.tsv) and fonts load
  await page('Runtime.evaluate', { expression: `(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,300));})()`, awaitPromise: true });
  return page;
}

async function renderCard(page, card, dataUrl) {
  const hlHtml = headlineHtml(card.headline, card.highlight);
  const setExpr = `(() => {
    const cat = ${JSON.stringify(card.category || 'NEWS')};
    document.getElementById('catLabel').textContent = cat;
    if (typeof applyCatAccent === 'function') applyCatAccent(cat);
    document.getElementById('headline').innerHTML = ${JSON.stringify(hlHtml)};
    document.getElementById('summary').textContent = ${JSON.stringify(card.summary || '')};
    if (typeof setBackground === 'function') setBackground(${JSON.stringify(dataUrl)});
  })()`;
  await page('Runtime.evaluate', { expression: setExpr });
  await page('Runtime.evaluate', {
    expression: `(async()=>{await document.fonts.ready; if(typeof fitHeadline==='function') fitHeadline(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`,
    awaitPromise: true,
  });
}

async function shoot(page, outPath) {
  const b = await page('Runtime.evaluate', {
    expression: `(()=>{const r=document.getElementById('news').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`,
    returnByValue: true,
  });
  const { x, y, width, height } = b.result.value;
  const shot = await page('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { x, y, width, height, scale: 1 } });
  const buf = Buffer.from(shot.data, 'base64');
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('capture is not a PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== OUT_SIDE || h !== OUT_SIDE) throw new Error(`${basename(outPath)} is ${w}x${h}, expected ${OUT_SIDE}x${OUT_SIDE}`);
  await writeFile(outPath, buf);
}

async function main() {
  const opts = parseArgs();
  const cards = JSON.parse(await readFile(opts.cards, 'utf8'));
  await mkdir(opts.out, { recursive: true });

  // the template fetches a relative news.tsv on load; a header-only stub keeps it quiet
  const stub = join(RENDERER_DIR, 'news.tsv');
  try { await access(stub); } catch { await writeFile(stub, 'id\tcategory\theadline\thighlight\tsummary\tsource\tdate\n'); }

  const bin = await resolveChrome(opts.chrome);
  const { server, port } = await startStaticServer(RENDERER_DIR);
  const url = `http://127.0.0.1:${port}/news.html`;
  const chrome = await launchChrome(bin);
  const cdp = new Cdp(chrome.wsUrl);

  try {
    const page = await newPage(cdp, url);
    for (const card of cards) {
      const bgBuf = await readFile(join(opts.root, card.bg));
      const dataUrl = `data:image/png;base64,${bgBuf.toString('base64')}`;
      await renderCard(page, card, dataUrl);
      const out = join(opts.out, `post-${card.id}.png`);
      await shoot(page, out);
      console.log(`wrote ${basename(out)}`);
    }
  } finally {
    try { await cdp.call('Browser.close'); } catch {}
    await new Promise((r) => { const t = setTimeout(() => { try { chrome.proc.kill('SIGKILL'); } catch {} r(); }, 3000); chrome.proc.once('exit', () => { clearTimeout(t); r(); }); });
    await rm(chrome.userDataDir, { recursive: true, force: true });
    await new Promise((r) => server.close(r));
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
