#!/usr/bin/env node
/**
 * quote.mjs — render Pietro quote cards (quote.html) headless to 2160x2160 PNGs.
 *
 * Replaces the pietro.works quote repo's tools/export-quote-images.mjs inside the dispatch
 * pipeline: no hash pin on the tsv, no 180-row cap, the tsv is an argument, and the output
 * is named pietro-quote-NNN.png so tools/scan-assets.mjs (scanQuotes) picks it up unchanged.
 *
 * Usage:
 *   node renderer/quote.mjs --out <dir> [--tsv <quotes.tsv>] [--ids all|1-5,9] [--force] [--chrome <path>]
 *
 * quotes.tsv: header row, then `id<TAB>quote<TAB>highlight`. Default tsv is the quote library at
 * ../../pietro.works/gen/quote/quotes.tsv. The page is served from this folder with /quotes.tsv
 * mapped to the chosen file, so quote.html itself is unchanged from the quote generator.
 */
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rename, rm, stat, unlink, writeFile, access } from 'node:fs/promises';
import { createReadStream, constants as FS } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TSV = resolve(HERE, '../../pietro.works/gen/quote/quotes.tsv');
const SIDE = 1080;
const OUT_SIDE = 2160;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { out: null, tsv: DEFAULT_TSV, ids: 'all', force: false, chrome: null, batch: 30 };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--tsv') o.tsv = resolve(a[++i]);
    else if (a[i] === '--ids') o.ids = a[++i];
    else if (a[i] === '--force') o.force = true;
    else if (a[i] === '--chrome') o.chrome = a[++i];
    else if (a[i] === '--batch') o.batch = Number(a[++i]);
    else throw new Error(`Unknown argument: ${a[i]}`);
  }
  if (!o.out) throw new Error('Required: --out <dir>');
  return o;
}

async function readQuotes(tsv) {
  const rows = (await readFile(tsv, 'utf8')).trim().split('\n').slice(1).map((l) => l.split('\t'));
  return rows.map(([id, quote, highlight], index) => ({ id: (id || '').trim(), quote: quote || '', highlight: highlight || '', index }));
}

function pickIds(spec, quotes) {
  if (spec === 'all') return quotes;
  const want = new Set();
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Invalid --ids segment: ${part}`);
    for (let n = Number(m[1]); n <= Number(m[2] || m[1]); n += 1) want.add(String(n).padStart(3, '0'));
  }
  const found = quotes.filter((q) => want.has(q.id.padStart(3, '0')));
  const missing = [...want].filter((w) => !found.some((q) => q.id.padStart(3, '0') === w));
  if (missing.length) throw new Error(`Not in tsv: ${missing.join(', ')}`);
  return found;
}

function mimeType(p) {
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.tsv': 'text/tab-separated-values; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' })[extname(p).toLowerCase()] || 'application/octet-stream';
}

async function startStaticServer(tsv) {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const path = rel === '/quotes.tsv' ? tsv : resolve(HERE, `.${rel === '/' ? '/quote.html' : rel}`);
      if (path !== tsv && !path.startsWith(HERE)) { res.writeHead(403); res.end(); return; }
      const info = await stat(path);
      if (!info.isFile()) throw new Error('nf');
      res.writeHead(200, { 'Content-Type': mimeType(path), 'Content-Length': info.size });
      createReadStream(path).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

async function resolveChrome(x) {
  const cands = [x, process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  for (const c of cands) { try { await access(c, FS.X_OK); return c; } catch {} }
  throw new Error('No Chrome found. Pass --chrome or set CHROME_BIN.');
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 1; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
    this.ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej, timer } = this.pending.get(m.id); clearTimeout(timer); this.pending.delete(m.id);
        m.error ? rej(new Error(`${m.error.message}: ${JSON.stringify(m.error.data || '')}`)) : res(m.result || {});
      } else if (m.method && this.listeners.has(m.method)) for (const l of this.listeners.get(m.method)) l(m);
    });
  }
  async call(method, params = {}, sessionId) {
    await this.ready; const id = this.id++; const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
    const p = new Promise((res, rej) => { const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 30000); this.pending.set(id, { res, rej, timer }); });
    this.ws.send(JSON.stringify(payload)); return p;
  }
  once(method, sessionId) {
    return new Promise((res) => {
      const l = (m) => { if (sessionId && m.sessionId !== sessionId) return; this.listeners.set(method, (this.listeners.get(method) || []).filter((x) => x !== l)); res(m.params || {}); };
      this.listeners.set(method, [...(this.listeners.get(method) || []), l]);
    });
  }
  close() { this.ws.close(); }
}

async function launchChrome(bin) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'pietro-quote-chrome-'));
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; proc.stderr.on('data', (c) => { stderr += c.toString(); });
  let port = null;
  for (let i = 0; i < 100; i += 1) { try { port = Number((await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await sleep(100); } }
  if (!port) { proc.kill('SIGKILL'); throw new Error(`Chrome gave no DevTools port.\n${stderr.slice(0, 500)}`); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return { proc, userDataDir, wsUrl: ver.webSocketDebuggerUrl };
}

async function closeChrome(chrome, client) {
  try { if (client) await client.call('Browser.close'); } catch {}
  await new Promise((r) => { const t = setTimeout(() => { try { chrome.proc.kill('SIGKILL'); } catch {} r(); }, 3000); chrome.proc.once('exit', () => { clearTimeout(t); r(); }); });
  await rm(chrome.userDataDir, { recursive: true, force: true });
}

async function waitFor(page, expr, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = await page('Runtime.evaluate', { expression: `Boolean(${expr})`, returnByValue: true });
    if (r.result?.value === true) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expr.replace(/\s+/g, ' ').trim()}`);
}

const settle = `(async () => { await document.fonts.ready; if (typeof fitQuote === 'function') fitQuote(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`;

async function createPage(client, url, total) {
  const { targetId } = await client.call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.call('Target.attachToTarget', { targetId, flatten: true });
  const page = (m, p = {}) => client.call(m, p, sessionId);
  await page('Page.enable'); await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', { width: SIDE, height: SIDE, deviceScaleFactor: 2, mobile: false, scale: 1 });
  const load = client.once('Page.loadEventFired', sessionId);
  await page('Page.navigate', { url }); await load;
  await waitFor(page, `document.readyState === 'complete' && document.querySelector('#quoteNumInput') && document.querySelector('#qIndex') && document.querySelector('#quote') && document.querySelector('#totalCount') && document.querySelector('#totalCount').textContent.trim() === '/ ${total}'`, 30000);
  await page('Runtime.evaluate', { expression: settle, awaitPromise: true });
  return page;
}

async function renderOne(page, q) {
  await page('Runtime.evaluate', { expression: `(() => { const i = document.querySelector('#quoteNumInput'); i.value = '${q.index + 1}'; i.dispatchEvent(new Event('change', { bubbles: true })); })()` });
  await waitFor(page, `document.querySelector('#qIndex').textContent.includes('${q.id.padStart(3, '0')}')`, 10000);
  await page('Runtime.evaluate', { expression: settle, awaitPromise: true });
}

async function pngSize(path) {
  const b = await readFile(path);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${path} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const validOutput = async (p) => { try { const s = await pngSize(p); return s.w === OUT_SIDE && s.h === OUT_SIDE; } catch { return false; } };

async function shoot(page, outPath) {
  const b = await page('Runtime.evaluate', { expression: `(() => { const r = document.querySelector('#quote').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`, returnByValue: true });
  const { x, y, width, height } = b.result.value;
  const shot = await page('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { x, y, width, height, scale: 1 } });
  const tmp = `${outPath}.tmp`;
  await writeFile(tmp, Buffer.from(shot.data, 'base64'));
  const s = await pngSize(tmp);
  if (s.w !== OUT_SIDE || s.h !== OUT_SIDE) { await unlink(tmp).catch(() => {}); throw new Error(`${outPath} rendered ${s.w}x${s.h}, expected ${OUT_SIDE}x${OUT_SIDE}`); }
  await rename(tmp, outPath);
}

async function main() {
  const o = parseArgs();
  const all = await readQuotes(o.tsv);
  const todo = pickIds(o.ids, all);
  const out = resolve(o.out);
  await mkdir(out, { recursive: true });
  const bin = await resolveChrome(o.chrome);
  const { server, port } = await startStaticServer(o.tsv);
  let wrote = 0, skipped = 0;
  try {
    for (let i = 0; i < todo.length; i += o.batch) {
      const chrome = await launchChrome(bin); let client = null;
      try {
        client = new Cdp(chrome.wsUrl);
        const page = await createPage(client, `http://127.0.0.1:${port}/quote.html`, all.length);
        for (const q of todo.slice(i, i + o.batch)) {
          const id = q.id.padStart(3, '0');
          // PACS0009 — pietro-quote-NNN.png is the name scanQuotes keys on — AGENTS.md (known sites, not exhaustive)
          const dest = join(out, `pietro-quote-${id}.png`);
          if (!o.force && await validOutput(dest)) { skipped += 1; console.log(`skip ${id}`); continue; }
          await renderOne(page, q); await shoot(page, dest); wrote += 1; console.log(`wrote ${id}`);
        }
      } finally { await closeChrome(chrome, client); }
    }
  } finally { await new Promise((r) => server.close(r)); }
  console.log(`done wrote=${wrote} skipped=${skipped} out=${out}`);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
