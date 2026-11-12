#!/usr/bin/env node
/**
 * backfill-archive-numbers.mjs — stamp meta.number into queue folders that were archived before
 * archive-to-dispatch-posts.mjs started recording it (PACS0006). Without the number, a re-archive
 * mints a second NNN for the same post and the slides LinkedIn title loses its #NNN.
 *
 * Matching is by content, never by guess: the archive COPIES files, so a delivery's primary file
 * (post-1.png, slides.pdf, fluxogram.png, tutorial.png, banner-1.png) is byte-identical to its
 * archived copy. A folder is stamped only when exactly one archived file of its type has the same
 * sha256. No match = never archived (left alone; the next archive mints a fresh number, correctly).
 * Several matches = ambiguous (reported, left alone).
 *
 *   node pipeline/backfill-archive-numbers.mjs [--queue <dir>] [--archive <dir>] [--apply]
 *
 * Dry-run by default. --apply writes meta.json via tmp+rename, keeping every other field.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV = resolve(HERE, '..', '..', '..');
const arg = (n, f) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : f; };
const QUEUE = resolve(arg('--queue', join(ENV, 'queue')));
const ARCHIVE = resolve(arg('--archive', join(ENV, 'dispatch-posts')));
const APPLY = process.argv.includes('--apply');

// type -> where its deliveries live, which file identifies one, and its archived name pattern
const TYPES = [
  { type: 'news', root: 'Pietro Dispatch', depth: 2, primary: 'post-1.png', archived: /^news-(\d{3})\.png$/ },
  { type: 'slides', root: 'Pietro Slides', depth: 1, primary: 'slides.pdf', archived: /^slides-(\d{3})\.pdf$/ },
  { type: 'fluxo', root: 'Pietro Fluxograms', depth: 1, primary: 'fluxogram.png', archived: /^pietro-fluxo-(\d{3})\.png$/ },
  { type: 'tutorial', root: 'Pietro Tutorials', depth: 1, primary: 'tutorial.png', archived: /^tutorial-(\d{3})\.png$/ },
  { type: 'article', root: 'Pietro Articles', depth: 1, primary: 'banner-1.png', archived: /^article-(\d{3})\.png$/ },
];

const sha = async (p) => createHash('sha256').update(await readFile(p)).digest('hex');
const isDir = async (p) => (await stat(p).catch(() => null))?.isDirectory() ?? false;
const isFile = async (p) => (await stat(p).catch(() => null))?.isFile() ?? false;

async function deliveries(root, depth) {
  if (!await isDir(root)) return [];
  let level = [root];
  for (let d = 0; d < depth; d += 1) {
    const next = [];
    for (const dir of level) for (const n of await readdir(dir)) if (!n.startsWith('.') && await isDir(join(dir, n))) next.push(join(dir, n));
    level = next;
  }
  return level;
}

async function main() {
  const archiveNames = await readdir(ARCHIVE);
  const totals = { stamped: 0, already: 0, unarchived: 0, ambiguous: 0, nometa: 0 };
  for (const t of TYPES) {
    const byHash = new Map();
    for (const n of archiveNames) {
      const m = n.match(t.archived); if (!m) continue;
      const h = await sha(join(ARCHIVE, n));
      byHash.set(h, [...(byHash.get(h) || []), Number(m[1])]);
    }
    for (const dir of await deliveries(join(QUEUE, t.root), t.depth)) {
      const metaPath = join(dir, 'meta.json');
      const primary = join(dir, t.primary);
      if (!await isFile(primary)) continue;
      if (!await isFile(metaPath)) { totals.nometa += 1; console.log(`no meta.json   ${t.type} ${dir}`); continue; }
      const meta = JSON.parse(await readFile(metaPath, 'utf8'));
      if (meta.number != null) { totals.already += 1; continue; }
      const hits = byHash.get(await sha(primary)) || [];
      if (hits.length === 0) { totals.unarchived += 1; console.log(`not archived   ${t.type} ${dir}`); continue; }
      if (hits.length > 1) { totals.ambiguous += 1; console.log(`AMBIGUOUS      ${t.type} ${dir} -> ${hits.join(', ')}`); continue; }
      totals.stamped += 1;
      console.log(`${APPLY ? 'stamped' : 'would stamp'}    ${t.type} #${String(hits[0]).padStart(3, '0')} ${dir}`);
      if (APPLY) {
        const tmp = `${metaPath}.tmp-${process.pid}`;
        await writeFile(tmp, `${JSON.stringify({ ...meta, number: hits[0] }, null, 2)}\n`);
        await rename(tmp, metaPath);
      }
    }
  }
  console.log(`${APPLY ? 'applied' : 'dry-run'}: ${JSON.stringify(totals)}`);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
