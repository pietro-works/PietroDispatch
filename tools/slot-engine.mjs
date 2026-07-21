#!/usr/bin/env node
/**
 * slot-engine.mjs — next-free-slot logic for Pietro Studio.
 *
 * A "slot" is a future local datetime allowed by a content type's pool (day-of-month parity
 * plus fixed times). A slot is FREE when no booking in calendar.json with a live status
 * (pending/scheduled/verified) already sits on it; a failed booking frees its slot again.
 *
 * Library:  import { nextFreeSlot, peek, loadSlots, loadCalendar } from './slot-engine.mjs'
 * CLI:      node slot-engine.mjs peek <type> [count]
 *           node slot-engine.mjs slots          # print the slot config
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(TOOLS_DIR, '..', 'db');
export const SLOTS_PATH = join(DB_DIR, 'slots.json');
export const CALENDAR_PATH = join(DB_DIR, 'calendar.json');

const LIVE = new Set(['pending', 'scheduled', 'verified']);

function pad2(n) { return String(n).padStart(2, '0'); }

// Local wall-clock parts -> UTC ISO, resolving the offset by iteration (DST-safe).
export function zonedLocalToUtcIso(parts, timeZone) {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const desired = guess;
  for (let i = 0; i < 5; i += 1) {
    const got = partsInZone(new Date(guess), timeZone);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second || 0);
    const delta = gotAsUtc - desired;
    if (delta === 0) break;
    guess -= delta;
  }
  return new Date(guess).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function partsInZone(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const v = Object.fromEntries(dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  return { year: v.year, month: v.month, day: v.day, hour: v.hour, minute: v.minute, second: v.second };
}

export async function loadSlots() {
  return JSON.parse(await readFile(SLOTS_PATH, 'utf8'));
}

export async function loadCalendar() {
  try {
    const text = await readFile(CALENDAR_PATH, 'utf8');
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function poolForType(slots, type) {
  const pool = (slots.pools || []).find((p) => p.managed && (p.types || []).includes(type));
  if (!pool) throw new Error(`No managed slot pool covers content type "${type}"`);
  return pool;
}

function takenSet(calendar, extra = []) {
  const taken = new Set();
  for (const b of calendar) if (LIVE.has(b.status)) taken.add(b.slot_iso);
  for (const iso of extra) taken.add(iso);
  return taken;
}

/**
 * Earliest free slot for `type`, at or after now + min_lead_hours, within window_days.
 * `extraTaken` lets a caller reserve slots within one batch before they hit calendar.json.
 * Returns { type, slot_local, slot_iso } or null if the window is full.
 */
export function nextFreeSlot(type, calendar, slots, extraTaken = []) {
  const tz = slots.timezone;
  const pool = poolForType(slots, type);
  const nowMs = Date.now();
  const startMs = nowMs + (slots.min_lead_hours || 0) * 3600e3;
  const maxMs = nowMs + (slots.window_days || 89) * 86400e3;
  const taken = takenSet(calendar, extraTaken);

  for (let d = 0; d <= (slots.window_days || 89) + 1; d += 1) {
    const lp = partsInZone(new Date(nowMs + d * 86400e3), tz);
    const parity = lp.day % 2 === 0 ? 'even' : 'odd';
    if (parity !== pool.parity) continue;
    for (const t of pool.times) {
      const [hh, mm] = t.split(':').map(Number);
      const iso = zonedLocalToUtcIso({ year: lp.year, month: lp.month, day: lp.day, hour: hh, minute: mm }, tz);
      const ms = Date.parse(iso);
      if (ms < startMs) continue;
      if (ms > maxMs) return null;
      if (taken.has(iso)) continue;
      return { type, slot_local: `${lp.year}-${pad2(lp.month)}-${pad2(lp.day)} ${t} ${tz}`, slot_iso: iso };
    }
  }
  return null;
}

/** Next `count` free slots for a type (each reserved before finding the next). */
export function peek(type, calendar, slots, count = 8) {
  const out = [];
  const reserved = [];
  for (let i = 0; i < count; i += 1) {
    const slot = nextFreeSlot(type, calendar, slots, reserved);
    if (!slot) break;
    out.push(slot);
    reserved.push(slot.slot_iso);
  }
  return out;
}

async function main() {
  const [mode = 'help', type, countArg] = process.argv.slice(2);
  if (mode === 'slots') { console.log(JSON.stringify(await loadSlots(), null, 2)); return; }
  if (mode === 'peek') {
    if (!type) throw new Error('Usage: slot-engine.mjs peek <type> [count]');
    const slots = await loadSlots();
    const calendar = await loadCalendar();
    const list = peek(type, calendar, slots, Number(countArg) || 8);
    console.log(`next free ${type} slots (${list.length}):`);
    for (const s of list) console.log(`  ${s.slot_local}   ${s.slot_iso}`);
    if (!list.length) console.log('  (window full)');
    return;
  }
  console.log('Usage:\n  node slot-engine.mjs peek <type> [count]\n  node slot-engine.mjs slots');
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
