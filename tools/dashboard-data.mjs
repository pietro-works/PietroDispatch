#!/usr/bin/env node
/**
 * dashboard-data.mjs — emit db/dashboard.json for the served dashboard: each asset joined
 * with its calendar status, the thumbnail PATH (loaded from disk by the page, no base64),
 * and a per-type preview of upcoming free slots.
 *
 * Usage: node dashboard-data.mjs [--limit 60]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSlots, loadCalendar, peek } from './slot-engine.mjs';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(TOOLS_DIR, '..', 'db');
const ASSETS_PATH = join(DB_DIR, 'assets.json');
const OUT_PATH = join(DB_DIR, 'dashboard.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export async function buildDashboard(limit = 60) {
  const assets = JSON.parse(await readFile(ASSETS_PATH, 'utf8'));
  const calendar = await loadCalendar();
  const slots = await loadSlots();
  const booking = new Map(calendar.map((b) => [b.asset_id, b]));

  const cards = assets.slice(0, limit).map((a) => {
    const b = booking.get(a.asset_id);
    return {
      asset_id: a.asset_id,
      type: a.type,
      kind: a.kind,
      manual_only: Boolean(a.manual_only),
      date: a.date,
      title: a.title || a.slug,
      caption_preview: (a.caption || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      thumb_path: a.thumb_rel ? `db/${a.thumb_rel}` : '',
      status: b ? b.status : 'unscheduled',
      slot_local: b ? b.slot_local : '',
      li_result: b ? (b.li_result || '') : '',
    };
  });

  const managed = [...new Set((slots.pools || []).filter((p) => p.managed).flatMap((p) => p.types))];
  const upcoming = {};
  for (const type of managed) upcoming[type] = peek(type, calendar, slots, 6).map((s) => s.slot_local);

  return { generated_at: new Date().toISOString(), tz: slots.timezone, upcoming, cards };
}

async function main() {
  const data = await buildDashboard(Number(arg('--limit', 60)));
  await writeFile(OUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${data.cards.length} cards -> ${OUT_PATH}`);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
