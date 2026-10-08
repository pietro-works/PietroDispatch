#!/usr/bin/env node
/**
 * scan-assets.mjs — index every postable asset on Drive into db/assets.json and
 * generate ~360px thumbnails into db/thumbs/. Source of truth is the Drive output of the
 * generator modules (news, slides, article); this only reads them.
 *
 *   News:   Pietro Dispatch/<DATE>/candidate-<NN>-<slug>/{post-1,post-2}.png + caption-{1,2}.txt
 *           (two image units per candidate; *_old.* archives are ignored)
 *   Slides: Pietro Slides/<DATE>-<slug>/{slides.pdf, post-01.png, caption.txt}
 *           (one document unit per deck; cover = post-01.png; title from slug)
 *   Article: Pietro Articles/<DATE>-<slug>/{banner-1.png, banner-2.png, meta.json}
 *           (two 1920x1080 cover variations per article; browse-only, the cover is
 *            uploaded by hand when the article is published, never auto-posted)
 *
 * Usage: node scan-assets.mjs [--drive <My Drive path>]
 */
import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { writeJsonAtomic } from './atomic-json.mjs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(TOOLS_DIR, '..', 'db');
const THUMBS_DIR = join(DB_DIR, 'thumbs');
const ASSETS_PATH = join(DB_DIR, 'assets.json');
const DEFAULT_DRIVE = '/Users/pietro/Library/CloudStorage/GoogleDrive-pietro@unidadezero.com/My Drive';
const THUMB_PX = 1080;   // long-side clamp; 1080 keeps thumbs sharp on Retina at card size (wide fluxograms suffered most at 520)
const THUMB_Q = 80;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function safeId(id) { return id.replace(/[^a-zA-Z0-9._-]/g, '_'); }
async function exists(p) { try { await stat(p); return true; } catch { return false; } }
async function readText(p) { return (await readFile(p, 'utf8')).trim(); }

function titleFromSlug(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function makeThumb(src, id) {
  const out = join(THUMBS_DIR, `${safeId(id)}.jpg`);
  // sips: clamp longest side to THUMB_PX, write JPEG. Cheap and built into macOS.
  await run('sips', ['-Z', String(THUMB_PX), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(THUMB_Q), src, '--out', out]);
  return `thumbs/${safeId(id)}.jpg`;
}

async function scanNews(drive, assets) {
  const root = join(drive, 'pietro-works-env/queue/Pietro Dispatch');
  if (!await exists(root)) return;
  const dates = (await readdir(root)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const date of dates) {
    const dateDir = join(root, date);
    const candidates = (await readdir(dateDir)).filter((d) => d.startsWith('candidate-'));
    for (const cand of candidates) {
      const candDir = join(dateDir, cand);
      let meta = {};
      try { meta = JSON.parse(await readFile(join(candDir, 'meta.json'), 'utf8')); } catch {}
      for (const v of [1, 2]) {
        const img = join(candDir, `post-${v}.png`);
        const cap = join(candDir, `caption-${v}.txt`);
        if (!await exists(img) || !await exists(cap)) continue;
        const id = `news:${date}:${cand}:v${v}`;
        let thumb_rel = '';
        try { thumb_rel = await makeThumb(img, id); } catch (e) { console.error(`thumb failed ${id}: ${e.message}`); }
        assets.push({
          asset_id: id, type: 'news', kind: 'image', date,
          slug: cand.replace(/^candidate-\d+-/, ''), variation: v,
          title: meta.headline || meta.title || titleFromSlug(cand.replace(/^candidate-\d+-/, '')),
          caption: await readText(cap), media_path: img, cover_path: img, thumb_rel,
        });
      }
    }
  }
}

async function scanSlides(drive, assets) {
  const root = join(drive, 'pietro-works-env/queue/Pietro Slides');
  if (!await exists(root)) return;
  const decks = (await readdir(root)).filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d)).sort();
  for (const deck of decks) {
    const deckDir = join(root, deck);
    const pdf = join(deckDir, 'slides.pdf');
    const cover = join(deckDir, 'post-01.png');
    const cap = join(deckDir, 'caption.txt');
    if (!await exists(pdf) || !await exists(cap)) continue;
    const date = deck.slice(0, 10);
    const slug = deck.slice(11);
    const id = `slides:${deck}`;
    // meta.number is the deck's dispatch-posts sequence (written at archive time); it becomes the
    // LinkedIn document title "Pietro.works IN_THE_LOOP.MD #NNN".
    let meta = {};
    try { meta = JSON.parse(await readFile(join(deckDir, 'meta.json'), 'utf8')); } catch {}
    const num = meta.number != null ? String(meta.number).padStart(3, '0') : '';
    let thumb_rel = '';
    if (await exists(cover)) { try { thumb_rel = await makeThumb(cover, id); } catch (e) { console.error(`thumb failed ${id}: ${e.message}`); } }
    assets.push({
      asset_id: id, type: 'slides', kind: 'document', date, slug, variation: 1, number: num,
      title: num ? `Pietro.works IN_THE_LOOP.MD #${num}` : titleFromSlug(slug),
      caption: await readText(cap), media_path: pdf,
      cover_path: await exists(cover) ? cover : '', thumb_rel,
    });
  }
}

async function scanArticles(drive, assets) {
  const root = join(drive, 'pietro-works-env/queue/Pietro Articles');
  if (!await exists(root)) return;
  const folders = (await readdir(root)).filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d)).sort();
  for (const folder of folders) {
    const dir = join(root, folder);
    let meta = {};
    try { meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')); } catch {}
    const date = folder.slice(0, 10);
    const slug = folder.slice(11);
    const cap = join(dir, 'caption.txt');
    const caption = await exists(cap) ? await readText(cap) : '';
    for (const v of [1, 2]) {
      const img = join(dir, `banner-${v}.png`);
      if (!await exists(img)) continue;
      const id = `article:${folder}:v${v}`;
      let thumb_rel = '';
      try { thumb_rel = await makeThumb(img, id); } catch (e) { console.error(`thumb failed ${id}: ${e.message}`); }
      assets.push({
        asset_id: id, type: 'article', kind: 'image', date, slug, variation: v,
        title: meta.title || meta.variations?.[v - 1]?.headline || titleFromSlug(slug),
        caption, media_path: img, cover_path: img, thumb_rel,
        manual_only: true, // an article cover is uploaded by hand at publish time; never schedule it
      });
    }
  }
}

async function scanFluxograms(drive, assets) {
  const root = join(drive, 'pietro-works-env/queue/Pietro Fluxograms');
  if (!await exists(root)) return;
  const folders = (await readdir(root)).filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d)).sort();
  for (const folder of folders) {
    const dir = join(root, folder);
    let meta = {};
    try { meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')); } catch {}
    const date = folder.slice(0, 10);
    const slug = folder.slice(11);
    const img = join(dir, 'fluxogram.png');       // PACS0001 — fluxogram.png is the fluxogram folder marker — AGENTS.md (known sites, not exhaustive)
    if (!await exists(img)) continue;
    const cap = join(dir, 'caption.txt');
    const caption = await exists(cap) ? await readText(cap) : '';
    const id = `fluxogram:${folder}`;
    let thumb_rel = '';
    try { thumb_rel = await makeThumb(img, id); } catch (e) { console.error(`thumb failed ${id}: ${e.message}`); }
    assets.push({
      asset_id: id, type: 'fluxogram', kind: 'image', date, slug,
      title: meta.title || titleFromSlug(slug),
      caption, media_path: img, cover_path: img, thumb_rel,
    });
  }
}

async function scanTutorials(drive, assets) {
  const root = join(drive, 'pietro-works-env/queue/Pietro Tutorials');
  if (!await exists(root)) return;
  const folders = (await readdir(root)).filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d)).sort();
  for (const folder of folders) {
    const dir = join(root, folder);
    let meta = {};
    try { meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')); } catch {}
    const date = folder.slice(0, 10);
    const slug = folder.slice(11);
    const img = join(dir, 'tutorial.png');       // PACS0001 — tutorial.png is the tutorial folder marker — AGENTS.md (known sites, not exhaustive)
    if (!await exists(img)) continue;
    const cap = join(dir, 'caption.txt');
    const caption = await exists(cap) ? await readText(cap) : '';
    const id = `tutorial:${folder}`;
    let thumb_rel = '';
    try { thumb_rel = await makeThumb(img, id); } catch (e) { console.error(`thumb failed ${id}: ${e.message}`); }
    assets.push({
      asset_id: id, type: 'tutorial', kind: 'image', date, slug,
      title: meta.title || titleFromSlug(slug),
      caption, media_path: img, cover_path: img, thumb_rel,
    });
  }
}

/**
 * Quotes: not a delivery folder. A flat library of 180 square quote images with one caption
 * each. The legacy quote scheduler's queue.tsv is the posted-record: status scheduled|skipped
 * means already live, so only `pending` rows become assets and a posted quote can never
 * re-enter the queue. Scheduling goes through apply-plan into explicit slots.
 */
async function scanQuotes(drive, assets) {
  const env = join(drive, 'pietro-works-env');
  const qDir = join(env, 'stack/pietro.works/gen/quote');
  const imgDir = join(env, 'assets/linkedin-images-2160');
  const queuePath = join(qDir, 'linkedin-schedule/queue.tsv');
  const postsPath = join(qDir, 'linkedin-posts.md');
  const tsvPath = join(qDir, 'quotes.tsv');
  if (!await exists(queuePath) || !await exists(postsPath) || !await exists(tsvPath)) return;
  const rows = (await readText(queuePath)).split('\n').slice(1).map((l) => l.split('\t'));
  const pending = rows.filter((r) => r[0] && r[5] === 'pending').map((r) => r[0]);   // PACS0009 — pending in the legacy queue.tsv is the only gate that keeps posted quotes out
  const captions = new Map();
  for (const m of (await readText(postsPath)).matchAll(/^## Post (\d{3})\s*\n([\s\S]*?)(?=^## Post \d{3}\s*$|(?![\s\S]))/gm)) captions.set(m[1], m[2].trim());
  const texts = new Map((await readText(tsvPath)).split('\n').slice(1).map((l) => { const c = l.split('\t'); return [c[0], c[1]]; }));
  for (const n of pending.sort()) {
    const img = join(imgDir, `pietro-quote-${n}.png`);
    const caption = captions.get(n) || '';
    if (!await exists(img) || !caption) { console.error(`quote ${n} skipped: ${!caption ? 'no caption in linkedin-posts.md' : 'no image'}`); continue; }
    const id = `quote:${n}`;
    let thumb_rel = '';
    try { thumb_rel = await makeThumb(img, id); } catch (e) { console.error(`thumb failed ${id}: ${e.message}`); }
    assets.push({
      asset_id: id, type: 'quote', kind: 'image', date: '', slug: `pietro-quote-${n}`, number: Number(n),
      title: texts.get(n) || `Quote ${n}`, caption, media_path: img, cover_path: img, thumb_rel,
    });
  }
}

async function main() {
  const drive = arg('--drive', DEFAULT_DRIVE);
  await mkdir(THUMBS_DIR, { recursive: true });
  const assets = [];
  // PACS0001 — every delivery type is wired in 5 places (contract doc, validate-contract.mjs,
  // this scanner, archive detectType, modules.json) — AGENTS.md (known sites, not exhaustive)
  await scanNews(drive, assets);
  await scanSlides(drive, assets);
  await scanArticles(drive, assets);
  await scanFluxograms(drive, assets);
  await scanTutorials(drive, assets);
  await scanQuotes(drive, assets);
  assets.sort((a, b) => (b.date.localeCompare(a.date)) || a.asset_id.localeCompare(b.asset_id));
  await writeJsonAtomic(ASSETS_PATH, assets);
  const byType = assets.reduce((m, a) => ((m[a.type] = (m[a.type] || 0) + 1), m), {});
  console.log(`wrote ${assets.length} assets -> ${ASSETS_PATH}`);
  console.log(`by type: ${JSON.stringify(byType)}`);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
