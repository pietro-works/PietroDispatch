#!/usr/bin/env node
/**
 * article.mjs — render Pietro article banners through article.html, headless, at 1920x1080.
 *
 * Same approach as news.mjs: a local static server for the template and its assets,
 * headless Chrome driven over CDP, an element-clip screenshot validated to size.
 * Differences from news.mjs: 16:9 canvas at deviceScaleFactor 1 (1920x1080 is the
 * LinkedIn article cover delivery size, so no 2x pass), banner selectors, a deck
 * line instead of a summary, and an optional per-banner kicker label.
 *
 * Usage:
 *   node renderer/article.mjs --banners work/<dir>/banners.json --root work/<dir> --out work/<dir>/banners [--chrome <path>] [--check-fit]
 *
 * banners.json: [{ id, category, headline, highlight, deck, bg, kicker?, headlineSize? }]
 *   bg is a path relative to --root, e.g. "backgrounds/bg-1.png" (1920x1080).
 *   deck may be "" for a headline-only banner.
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
const OUT_W = 1920;
const OUT_H = 1080;

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { banners: null, root: null, out: null, chrome: null, checkFit: false };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--banners') o.banners = a[++i];
    else if (a[i] === '--root') o.root = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--chrome') o.chrome = a[++i];
    else if (a[i] === '--check-fit') o.checkFit = true;
    else throw new Error(`Unknown argument: ${a[i]}`);
  }
  if (!o.banners || !o.root || !o.out) throw new Error('Required: --banners, --root, --out');
  return o;
}

// Banner layout rules, enforced from measureFit()'s real rendered metrics:
//   headline: 1 or 2 lines (3+ is a hard fail); a sub-96px headline is a soft warn (copy long).
//   deck: 0 lines (empty is allowed), 1 line, or 2 lines with the 2nd at least 40% full.
//   A 3-line deck or a stub 2nd line is a hard fail.
//   stray: no wrapped block (headline or deck) may strand a lone word on a line (shared with news/slides).
function fitVerdict(m) {
  if (!m) return { ok: true, notes: ['no measurement'] };
  const notes = [];
  let hard = false;
  if (m.headlineLines > 2) { notes.push(`headline ${m.headlineLines} lines (max 2)`); hard = true; }
  else if (m.headlineSize != null && m.headlineSize < 96) { notes.push(`headline ${m.headlineSize}px, copy runs long`); }
  if (m.deckLines > 2) { notes.push(`deck ${m.deckLines} lines (max 2)`); hard = true; }
  else if (m.deckLines === 2 && m.deckFill < 40) { notes.push(`deck 2nd line ${m.deckFill}% full (stub, need 40+)`); hard = true; }
  if (m.stray && m.stray.length) { notes.push(`stray word on ${m.stray.join(', ')}`); hard = true; }
  return { ok: !hard, notes };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// mirror article.html render(): escape headline, wrap the exact highlight substring
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
      const path = resolve(root, `.${rel === '/' ? '/article.html' : rel}`);
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
  const userDataDir = await mkdtemp(join(tmpdir(), 'pietro-article-chrome-'));
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
  // deviceScaleFactor 1: the 1920x1080 canvas IS the delivery size for article covers
  await page('Emulation.setDeviceMetricsOverride', { width: OUT_W, height: OUT_H, deviceScaleFactor: 1, mobile: false, scale: 1 });
  const load = cdp.once('Page.loadEventFired', sessionId);
  await page('Page.navigate', { url });
  await load;
  // let the template's own loadTSV settle (it reads the header-only article.tsv) and fonts load
  await page('Runtime.evaluate', { expression: `(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,300));})()`, awaitPromise: true });
  return page;
}

async function renderBanner(page, banner, dataUrl) {
  const hlHtml = headlineHtml(banner.headline, banner.highlight);
  const setExpr = `(() => {
    const cat = ${JSON.stringify(banner.category || 'ARTICLE')};
    document.getElementById('catLabel').textContent = cat;
    if (typeof applyCatAccent === 'function') applyCatAccent(cat);
    if (typeof setKicker === 'function') setKicker(${JSON.stringify(banner.kicker || 'ARTICLE')});
    document.getElementById('headline').innerHTML = ${JSON.stringify(hlHtml)};
    document.getElementById('deck').textContent = ${JSON.stringify(banner.deck || '')};
    if (typeof setBackground === 'function') setBackground(${JSON.stringify(dataUrl)});
    // optional per-banner headline cap; set BOTH controls on every banner so a
    // previous banner's override never leaks into the next one (same rule as news.mjs)
    const auto = document.getElementById('autoSize');
    const range = document.getElementById('sizeRange');
    const capOverride = ${JSON.stringify(banner.headlineSize ?? null)};
    if (auto && range) {
      auto.checked = capOverride === null;
      // let the template own the auto-fit cap (HEADLINE_CAP); only override on an explicit headlineSize
      if (capOverride !== null) range.value = capOverride;
      else if (typeof HEADLINE_CAP !== 'undefined') range.value = HEADLINE_CAP;
    }
  })()`;
  await page('Runtime.evaluate', { expression: setExpr });
  await page('Runtime.evaluate', {
    expression: `(async()=>{await document.fonts.ready; if(typeof fitHeadline==='function') fitHeadline(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`,
    awaitPromise: true,
  });
  const measured = await page('Runtime.evaluate', {
    expression: `(typeof measureFit === 'function') ? measureFit() : null`,
    returnByValue: true,
  });
  return measured.result.value;
}

async function shoot(page, outPath) {
  const b = await page('Runtime.evaluate', {
    expression: `(()=>{const r=document.getElementById('banner').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`,
    returnByValue: true,
  });
  const { x, y, width, height } = b.result.value;
  const shot = await page('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { x, y, width, height, scale: 1 } });
  const buf = Buffer.from(shot.data, 'base64');
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('capture is not a PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== OUT_W || h !== OUT_H) throw new Error(`${basename(outPath)} is ${w}x${h}, expected ${OUT_W}x${OUT_H}`);
  await writeFile(outPath, buf);
}

async function main() {
  const opts = parseArgs();
  const banners = JSON.parse(await readFile(opts.banners, 'utf8'));
  await mkdir(opts.out, { recursive: true });

  // the template fetches a relative article.tsv on load; a header-only stub keeps it quiet
  const stub = join(RENDERER_DIR, 'article.tsv');
  try { await access(stub); } catch { await writeFile(stub, 'id\tcategory\theadline\thighlight\tdeck\tkicker\n'); }

  const bin = await resolveChrome(opts.chrome);
  const { server, port } = await startStaticServer(RENDERER_DIR);
  const url = `http://127.0.0.1:${port}/article.html`;
  const chrome = await launchChrome(bin);
  const cdp = new Cdp(chrome.wsUrl);

  let fitFails = 0;
  try {
    const page = await newPage(cdp, url);
    for (const banner of banners) {
      const bgBuf = await readFile(join(opts.root, banner.bg));
      const dataUrl = `data:image/png;base64,${bgBuf.toString('base64')}`;
      const m = await renderBanner(page, banner, dataUrl);
      const out = join(opts.out, `banner-${banner.id}.png`);
      await shoot(page, out);
      const v = fitVerdict(m);
      const detail = m ? `h=${m.headlineLines}L@${m.headlineSize}px d=${m.deckLines}L/${m.deckFill}%` : 'nomeasure';
      console.log(`wrote ${basename(out)}  [fit ${v.ok ? 'ok' : 'FAIL'}] ${detail}${v.notes.length ? '  ' + v.notes.join('; ') : ''}`);
      if (!v.ok) fitFails += 1;
    }
  } finally {
    try { await cdp.call('Browser.close'); } catch {}
    await new Promise((r) => { const t = setTimeout(() => { try { chrome.proc.kill('SIGKILL'); } catch {} r(); }, 3000); chrome.proc.once('exit', () => { clearTimeout(t); r(); }); });
    await rm(chrome.userDataDir, { recursive: true, force: true });
    await new Promise((r) => server.close(r));
  }

  if (fitFails > 0) {
    console.log(`fit: ${fitFails} banner(s) failed the layout rule (headline <=2 lines; deck <=2 lines, no stub 2nd line; no stray word alone on a line)`);
    if (opts.checkFit) process.exit(1);
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
