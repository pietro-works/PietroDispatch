#!/usr/bin/env node
/**
 * archive-to-dispatch-posts.mjs — copy a delivered asset into the single unified flat archive
 * at pietro-works-env/dispatch-posts/, using the flat convention:
 *
 *   news card   -> news-NNN.png   (+ news-NNN-b.png for the 2nd variation)
 *                  bg-news-NNN.png (+ -b),  caption-news-NNN.txt (+ -b)
 *   slides deck -> slides-NNN.pdf,  slides-NNN.png (cover),  caption-slides-NNN.txt
 *   article     -> article-NNN.png (+ -b), bg-article-NNN.png (+ -b), caption-article-NNN.txt
 *   tutorial    -> tutorial-NNN.png, bg-tutorial-NNN.png,    caption-tutorial-NNN.txt
 *
 * NNN is the next free integer for that type (max existing + 1), zero-padded to 3.
 * It COPIES (never moves): the structured queue folder stays put for Studio to post from.
 * Idempotency: pass --dry-run to preview. Re-running re-archives (new NNN); dedupe by not
 * re-passing folders you already archived.
 *
 * Usage:
 *   node archive-to-dispatch-posts.mjs <delivery-folder> [--type news|slides|article|tutorial] [--archive <dir>] [--dry-run]
 *     <delivery-folder> = a news candidate-NN-slug/ dir, a slides or article <date>-slug/ dir, or a tutorial png's folder.
 *   Type is auto-detected from the folder contents when not given.
 */
import { readdir, readFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// default archive: pietro-works-env/dispatch-posts (three levels up from stack/pietro-dispatch/pipeline)
const DEFAULT_ARCHIVE = resolve(HERE, '..', '..', '..', 'dispatch-posts');

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { folder: null, type: null, archive: DEFAULT_ARCHIVE, dryRun: false };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--type') o.type = a[++i];
    else if (a[i] === '--archive') o.archive = a[++i];
    else if (a[i] === '--dry-run') o.dryRun = true;
    else if (!o.folder) o.folder = a[i];
    else throw new Error(`unexpected arg: ${a[i]}`);
  }
  if (!o.folder) throw new Error('need a <delivery-folder>');
  return o;
}
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

// PACS0001 — every delivery type must be wired in all five places: contract doc,
// validate-contract.mjs, scan-assets.mjs, this detectType, modules.json — AGENTS.md
async function detectType(folder) {
  const names = await readdir(folder);
  if (names.includes('slides.pdf')) return 'slides';
  if (names.some((n) => /^banner-[12]\.png$/.test(n))) return 'article';
  if (names.some((n) => /^post-[12]\.png$/.test(n))) return 'news';
  if (names.some((n) => /^tutorial-\d+\.png$/.test(n)) || names.some((n) => /^post-\d+\.png$/.test(n))) return 'tutorial';
  throw new Error(`cannot detect asset type in ${folder}`);
}

async function nextIndex(archive, type) {
  await mkdir(archive, { recursive: true });
  const files = await readdir(archive);
  const re = new RegExp(`^${type}-(\\d{3})(?:-b)?\\.`);
  let max = -1;
  for (const f of files) { const m = f.match(re); if (m) max = Math.max(max, Number(m[1])); }
  return max + 1;
}
const pad = (n) => String(n).padStart(3, '0');

async function archiveOne(o) {
  const folder = resolve(o.folder);
  const type = o.type || await detectType(folder);
  const nnn = pad(await nextIndex(o.archive, type));
  const plan = []; // [srcRel, destName]

  if (type === 'news') {
    for (const [v, suf] of [[1, ''], [2, '-b']]) {
      if (await exists(join(folder, `post-${v}.png`))) plan.push([`post-${v}.png`, `news-${nnn}${suf}.png`]);
      if (await exists(join(folder, `bg-${v}.png`))) plan.push([`bg-${v}.png`, `bg-news-${nnn}${suf}.png`]);
      if (await exists(join(folder, `caption-${v}.txt`))) plan.push([`caption-${v}.txt`, `caption-news-${nnn}${suf}.txt`]);
    }
  } else if (type === 'article') {
    for (const [v, suf] of [[1, ''], [2, '-b']]) {
      if (await exists(join(folder, `banner-${v}.png`))) plan.push([`banner-${v}.png`, `article-${nnn}${suf}.png`]);
      if (await exists(join(folder, `bg-${v}.png`))) plan.push([`bg-${v}.png`, `bg-article-${nnn}${suf}.png`]);
    }
    if (await exists(join(folder, 'caption.txt'))) plan.push(['caption.txt', `caption-article-${nnn}.txt`]);
  } else if (type === 'slides') {
    if (await exists(join(folder, 'slides.pdf'))) plan.push(['slides.pdf', `slides-${nnn}.pdf`]);
    if (await exists(join(folder, 'post-01.png'))) plan.push(['post-01.png', `slides-${nnn}.png`]);
    if (await exists(join(folder, 'caption.txt'))) plan.push(['caption.txt', `caption-slides-${nnn}.txt`]);
  } else if (type === 'tutorial') {
    const names = await readdir(folder);
    const png = names.find((n) => /^tutorial-\d+\.png$/.test(n)) || names.find((n) => /^post-01\.png$/.test(n)) || names.find((n) => n.endsWith('.png') && !n.startsWith('bg-'));
    const bg = names.find((n) => /^bg-/.test(n) && n.endsWith('.png'));
    if (png) plan.push([png, `tutorial-${nnn}.png`]);
    if (bg) plan.push([bg, `bg-tutorial-${nnn}.png`]);
    if (names.includes('caption.txt')) plan.push(['caption.txt', `caption-tutorial-${nnn}.txt`]);
  } else throw new Error(`unknown type ${type}`);

  if (!plan.length) throw new Error(`nothing to archive from ${folder} (type ${type})`);
  console.log(`${basename(folder)} -> ${type}-${nnn}`);
  for (const [src, dest] of plan) {
    console.log(`  ${src}  ->  ${dest}`);
    if (!o.dryRun) await copyFile(join(folder, src), join(o.archive, dest));
  }
  return { type, nnn, count: plan.length };
}

const o = parseArgs();
archiveOne(o).then((r) => console.log(o.dryRun ? '(dry-run, nothing written)' : `archived ${r.count} files as ${r.type}-${r.nnn}`))
  .catch((e) => { console.error(e.message); process.exit(1); });
