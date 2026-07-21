#!/usr/bin/env node
/**
 * studio-server.mjs — run Pietro Studio standalone, no Claude needed. Lives at pietro-dispatch root:
 * the hub (index.html) and schedule (dashboard.html) are the operating layer of dispatch.
 *
 *   node tools/studio-server.mjs [--port 8770] [--no-open]
 *
 * Serves the studio folder over localhost and gives dashboard.html a live backend:
 *   GET  /api/data              assets joined with calendar + saved week plan
 *   POST /api/refresh           re-run scan-assets.mjs, then return fresh data
 *   POST /api/plan              save week placements to db/plan.json (slots computed server-side)
 *   POST /api/schedule          save plan, then spawn publish.mjs apply-plan (LinkedIn Chrome)
 *   GET  /api/run               status + log of the current/last schedule run
 *
 * Placements arrive as { asset_id, local: { y, m, d, h } } in the studio timezone;
 * slot_iso is derived here with the same DST-safe conversion the slot engine uses.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir, readdir, mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadSlots, loadCalendar, zonedLocalToUtcIso } from './slot-engine.mjs';
import { buildDashboard } from './dashboard-data.mjs';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOLS_DIR, '..');
const DB_DIR = join(ROOT, 'db');
const PLAN_PATH = join(DB_DIR, 'plan.json');
const LIVE = new Set(['pending', 'scheduled', 'verified']);

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
// 8765 is permanently held by the rclone WebDAV mount for the Drive; Studio defaults to 8770
// and auto-advances if the port is busy, so a double-click never dies on EADDRINUSE.
const PORT = Number(arg('--port', 8770));
const MAX_PORT_TRIES = 20;
const NO_OPEN = process.argv.includes('--no-open');

// sibling mounts: the hub opens generator templates and the fluxogram editor straight
// from Studio, and /queue/ lets the editor's bg-db + media thumbs resolve over HTTP.
const MOUNTS = [
  { prefix: '/renderer/', root: resolve(ROOT, 'renderer') },
  { prefix: '/queue/',    root: resolve(ROOT, '..', '..', 'queue') },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

const run = { proc: null, log: '', exitCode: null, startedAt: null };

// ---- render-to-dispatch-posts: each kind continues its existing numbered series ----
const ARCHIVE_DIR = resolve(ROOT, '..', '..', 'dispatch-posts');
const RENDER_KINDS = {
  fluxogram: { prefix: 'pietro-fluxo', ext: 'png' },
  slides:    { prefix: 'slides',       ext: 'pdf' },
  tutorial:  { prefix: 'tutorial',     ext: 'png' },
};
let renderBusy = false;
async function nextName(prefix) {
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const re = new RegExp(`^${prefix}-(\\d+)(?:-b)?\\.`);
  let max = 0, width = 3;
  for (const f of await readdir(ARCHIVE_DIR)) {
    const m = f.match(re);
    if (m) { max = Math.max(max, Number(m[1])); width = Math.max(width, m[1].length); }
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}
async function renderKind(kind, spec) {
  const k = RENDER_KINDS[kind];
  if (!k) throw new Error('unsupported kind — news and article render through the pipeline');
  const name = await nextName(k.prefix);
  const tmp = await mkdtemp(join(tmpdir(), 'pw-render-'));
  const specPath = join(tmp, 'spec.json');
  await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  let log = '';
  const runOne = (args) => new Promise((res) => {
    const p = spawn(process.execPath, args, { cwd: ROOT });
    const eat = (c) => { log += c.toString(); };
    p.stdout.on('data', eat); p.stderr.on('data', eat);
    p.on('close', (code) => res(code));
  });
  const R = join(ROOT, 'renderer');
  const files = [];
  let code = 1;
  if (kind === 'fluxogram') {
    const out = join(ARCHIVE_DIR, `${name}.png`);
    code = await runOne([join(R, 'fluxogram.mjs'), '--data', specPath, '--out', out, '--format', 'png', '--width', '2400']);
    if (code === 0) files.push(`${name}.png`);
  } else if (kind === 'tutorial') {
    const out = join(ARCHIVE_DIR, `${name}.png`);
    code = await runOne([join(R, 'tutorial.mjs'), '--spec', specPath, '--root', R, '--out', out]);
    if (code === 0) files.push(`${name}.png`);
  } else if (kind === 'slides') {
    const outDir = join(tmp, 'out');
    const pdf = join(ARCHIVE_DIR, `${name}.pdf`);
    code = await runOne([join(R, 'slides.mjs'), '--deck', specPath, '--root', tmp, '--out', outDir, '--pdf', pdf]);
    if (code === 0) {
      files.push(`${name}.pdf`);
      await copyFile(join(outDir, 'post-01.png'), join(ARCHIVE_DIR, `${name}.png`)).then(() => files.push(`${name}.png`)).catch(() => {});
    }
  }
  if (code === 0) { await copyFile(specPath, join(ARCHIVE_DIR, `${name}.json`)); files.push(`${name}.json`); }
  return { ok: code === 0, name, files, log: log.slice(-4000) };
}

function pad2(n) { return String(n).padStart(2, '0'); }

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function loadPlan() {
  try { const p = JSON.parse(await readFile(PLAN_PATH, 'utf8')); return Array.isArray(p) ? p : []; }
  catch { return []; }
}

async function apiData() {
  const [dashboard, calendar, plan, slots] = await Promise.all([buildDashboard(120), loadCalendar(), loadPlan(), loadSlots()]);
  return { ...dashboard, calendar, plan, tzNowIso: new Date().toISOString(), timezone: slots.timezone };
}

function spawnNode(args, onLine) {
  return new Promise((resolveP) => {
    const p = spawn(process.execPath, args, { cwd: ROOT });
    const eat = (c) => { for (const l of c.toString().split('\n')) if (l.trim()) onLine(l); };
    p.stdout.on('data', eat); p.stderr.on('data', eat);
    p.on('close', (code) => resolveP(code));
  });
}

/** Turn client placements into validated plan rows with server-computed slots. */
async function buildPlanRows(placements) {
  const slots = await loadSlots();
  const calendar = await loadCalendar();
  const liveSlots = new Set(calendar.filter((b) => LIVE.has(b.status)).map((b) => b.slot_iso));
  const liveAssets = new Set(calendar.filter((b) => LIVE.has(b.status)).map((b) => b.asset_id));
  const seen = new Set();
  const rows = []; const rejected = [];
  for (const p of placements || []) {
    const L = p.local || {};
    if (!p.asset_id || ![L.y, L.m, L.d, L.h].every(Number.isInteger)) { rejected.push({ ...p, reason: 'malformed' }); continue; }
    const slot_iso = zonedLocalToUtcIso({ year: L.y, month: L.m, day: L.d, hour: L.h, minute: 0 }, slots.timezone);
    const slot_local = `${L.y}-${pad2(L.m)}-${pad2(L.d)} ${pad2(L.h)}:00 ${slots.timezone}`;
    if (Date.parse(slot_iso) < Date.now() + 30 * 60e3) { rejected.push({ asset_id: p.asset_id, slot_local, reason: 'past or < 30 min away' }); continue; }
    if (liveSlots.has(slot_iso)) { rejected.push({ asset_id: p.asset_id, slot_local, reason: 'slot already booked' }); continue; }
    if (liveAssets.has(p.asset_id)) { rejected.push({ asset_id: p.asset_id, slot_local, reason: 'asset already scheduled' }); continue; }
    if (seen.has(slot_iso)) { rejected.push({ asset_id: p.asset_id, slot_local, reason: 'duplicate slot in plan' }); continue; }
    seen.add(slot_iso);
    rows.push({ asset_id: p.asset_id, slot_iso, slot_local });
  }
  return { rows, rejected };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const path = url.pathname;

    if (path === '/api/data' && req.method === 'GET') return send(res, 200, await apiData());

    if (path === '/api/refresh' && req.method === 'POST') {
      let log = '';
      const code = await spawnNode([join(TOOLS_DIR, 'scan-assets.mjs')], (l) => { log += `${l}\n`; });
      if (code !== 0) return send(res, 500, { error: 'scan-assets failed', log });
      return send(res, 200, { ok: true, log, data: await apiData() });
    }

    if (path === '/api/plan' && req.method === 'POST') {
      const body = await readBody(req);
      const { rows, rejected } = await buildPlanRows(body.placements);
      await writeFile(PLAN_PATH, `${JSON.stringify(rows, null, 2)}\n`);
      return send(res, 200, { ok: true, saved: rows.length, rejected });
    }

    if (path === '/api/schedule' && req.method === 'POST') {
      if (run.proc) return send(res, 409, { error: 'a schedule run is already in progress' });
      const body = await readBody(req);
      const { rows, rejected } = await buildPlanRows(body.placements);
      if (!rows.length) return send(res, 400, { error: 'nothing schedulable in the plan', rejected });
      await writeFile(PLAN_PATH, `${JSON.stringify(rows, null, 2)}\n`);
      run.log = ''; run.exitCode = null; run.startedAt = new Date().toISOString();
      run.proc = spawn(process.execPath, [join(TOOLS_DIR, 'publish.mjs'), 'apply-plan', '--plan', PLAN_PATH], { cwd: ROOT });
      const eat = (c) => { run.log += c.toString(); if (run.log.length > 200000) run.log = run.log.slice(-100000); };
      run.proc.stdout.on('data', eat); run.proc.stderr.on('data', eat);
      run.proc.on('close', (code) => { run.exitCode = code; run.proc = null; });
      return send(res, 200, { ok: true, planned: rows.length, rejected });
    }

    if (path === '/api/next-name' && req.method === 'GET') {
      const k = RENDER_KINDS[url.searchParams.get('kind')];
      if (!k) return send(res, 400, { error: 'unknown kind' });
      return send(res, 200, { name: await nextName(k.prefix) });
    }

    if (path === '/api/render' && req.method === 'POST') {
      if (renderBusy) return send(res, 409, { error: 'a render is already in progress' });
      renderBusy = true;
      try {
        const body = await readBody(req);
        const out = await renderKind(body.kind, body.spec);
        return send(res, out.ok ? 200 : 500, out);
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      } finally { renderBusy = false; }
    }

    if (path === '/api/run' && req.method === 'GET') {
      return send(res, 200, { running: Boolean(run.proc), exitCode: run.exitCode, startedAt: run.startedAt, log: run.log.slice(-8000) });
    }

    // static files, path-confined to the studio folder or an allowed sibling mount
    const rel = decodeURIComponent(path) === '/' ? '/index.html' : decodeURIComponent(path);
    let base = ROOT, sub = rel;
    for (const m of MOUNTS) if (rel.startsWith(m.prefix)) { base = m.root; sub = `/${rel.slice(m.prefix.length)}`; break; }
    const file = resolve(base, `.${sub}`);
    if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404); return res.end(); }
    const ext = extname(file).toLowerCase();
    const head = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': info.size };
    if (ext === '.html' || ext === '.json') head['Cache-Control'] = 'no-store';   // edits reach the browser without a hard refresh
    res.writeHead(200, head);
    createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

let bindPort = PORT;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && bindPort < PORT + MAX_PORT_TRIES) {
    console.log(`port ${bindPort} in use, trying ${bindPort + 1}…`);
    bindPort += 1;
    setTimeout(() => server.listen(bindPort, '127.0.0.1'), 100);
    return;
  }
  console.error(`Studio failed to start: ${e.message}`);
  process.exit(1);
});

server.listen(bindPort, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Pietro Studio on ${url}`);
  if (!NO_OPEN && process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore' });
});
