#!/usr/bin/env node
/**
 * publish.mjs — Pietro Studio publisher. Books selected assets into the next free slot for
 * their type (slot-engine) and natively schedules them on LinkedIn (linkedin-core). The
 * single DB is db/calendar.json.
 *
 *   node publish.mjs plan
 *   node publish.mjs discover [--headless]
 *   node publish.mjs apply --ids <id1,id2,...> [--dry-run] [--headless] [--max N]
 *   node publish.mjs apply-plan --plan <plan.json> [--dry-run] [--headless]
 *   node publish.mjs unschedule --ids <id1,id2,...> [--dry-run] [--headless]
 *   node publish.mjs verify [--headless]
 *
 * asset ids come from db/assets.json (run scan-assets.mjs first). A slot is reserved per
 * asset; a slot already holding a live booking (pending/scheduled/verified) is skipped.
 */
import { readFile, writeFile, rename, mkdir, open, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSlots, loadCalendar, nextFreeSlot, CALENDAR_PATH } from './slot-engine.mjs';
import { runWithChrome, scheduleOne, deleteScheduledPost, readScheduledList, scheduledRowLabel, isLoggedIn, waitForLogin, saveHookReport, screenshot, clearTransientUi, navigate } from './linkedin-core.mjs';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(TOOLS_DIR, '..', 'db');
const ASSETS_PATH = join(DB_DIR, 'assets.json');
const HOOKS_DIR = join(DB_DIR, 'li-hooks');
const SHOTS_DIR = join(DB_DIR, 'li-shots');
const LIVE = new Set(['pending', 'scheduled', 'verified']);

function parseArgs() {
  const [mode = 'help', ...rest] = process.argv.slice(2);
  const o = { mode, ids: null, plan: null, dryRun: false, headless: false, max: Infinity, loginTimeout: 600, keepOpen: false };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--ids') o.ids = rest[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--plan') o.plan = resolve(rest[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--headless') o.headless = true;
    else if (a === '--keep-open') o.keepOpen = true;
    else if (a === '--max') o.max = Number(rest[++i]);
    else if (a === '--login-timeout') o.loginTimeout = Number(rest[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return o;
}

function utc() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
async function loadAssets() { return JSON.parse(await readFile(ASSETS_PATH, 'utf8')); }
async function writeCalendar(rows) {
  await mkdir(DB_DIR, { recursive: true });
  const tmp = `${CALENDAR_PATH}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(rows, null, 2)}\n`);
  await rename(tmp, CALENDAR_PATH);
}

// PACS0007 — one publisher writes the calendar at a time. The LinkedIn scheduling loop persists
// db/calendar.json after every booking; a CLI `publish apply` running beside a Studio-spawned
// `apply-plan` would interleave those writes (last-writer-wins) and could double-post. A single
// exclusive lock serializes them; a fresh re-read before each post skips an asset another run
// already scheduled — AGENTS.md (known sites, not exhaustive)
async function withCalendarLock(fn) {
  const lock = `${CALENDAR_PATH}.lock`;
  await mkdir(DB_DIR, { recursive: true });
  let fh;
  try { fh = await open(lock, 'wx'); }
  catch (e) {
    if (e.code === 'EEXIST') throw new Error(`another publish run holds ${lock}; wait for it to finish, or remove that file if it is stale`);
    throw e;
  }
  try { return await fn(); }
  finally { await fh.close(); await rm(lock, { force: true }); }
}

async function ensureLogin(page, opts) {
  if (await isLoggedIn(page)) return;
  if (opts.headless) throw new Error('Not logged in and running headless. Run "discover" headful once to authenticate the profile.');
  console.log(`Log in to LinkedIn in the opened Chrome window. Waiting up to ${opts.loginTimeout}s...`);
  if (!await waitForLogin(page, opts.loginTimeout)) throw new Error('LinkedIn login was not detected before timeout');
}

async function modePlan() {
  const slots = await loadSlots();
  const calendar = await loadCalendar();
  const counts = calendar.reduce((m, b) => ((m[b.status] = (m[b.status] || 0) + 1), m), {});
  console.log(`calendar=${CALENDAR_PATH}`);
  console.log(`bookings=${calendar.length} ${JSON.stringify(counts)}`);
  // schedulable types come from the managed slot pools, same derivation as
  // dashboard-data.mjs; manual-only types (article) have no pool and stay out
  const managed = [...new Set((slots.pools || []).filter((p) => p.managed).flatMap((p) => p.types || []))];
  for (const type of managed) {
    const s = nextFreeSlot(type, calendar, slots);
    console.log(`next ${type}: ${s ? s.slot_local : '(full)'}`);
  }
  for (const b of calendar.filter((x) => LIVE.has(x.status)).sort((a, b2) => a.slot_iso.localeCompare(b2.slot_iso))) {
    console.log(`  ${b.slot_local}  ${b.status.padEnd(9)} ${b.asset_id}`);
  }
}

/** Book requested assets into free slots. Returns { bookings, calendar, skipped }. */
async function book(opts) {
  const assets = await loadAssets();
  const byId = new Map(assets.map((a) => [a.asset_id, a]));
  const slots = await loadSlots();
  const calendar = await loadCalendar();
  const liveByAsset = new Map(calendar.filter((b) => LIVE.has(b.status)).map((b) => [b.asset_id, b]));
  const reserved = [];
  const bookings = [];
  const skipped = [];
  for (const id of opts.ids) {
    const a = byId.get(id);
    if (!a) { skipped.push(`${id} (not in assets.json)`); continue; }
    if (liveByAsset.has(id)) { skipped.push(`${id} (already ${liveByAsset.get(id).status} @ ${liveByAsset.get(id).slot_local})`); continue; }
    if (a.manual_only) { skipped.push(`${id} (manual_only: article covers are uploaded by hand at publish time, never scheduled)`); continue; }
    if (bookings.length >= opts.max) { skipped.push(`${id} (over --max)`); continue; }
    // poolForType throws for a type with no managed pool; one bad id must not abort the batch
    let slot;
    try { slot = nextFreeSlot(a.type, calendar, slots, reserved); }
    catch (e) { skipped.push(`${id} (${e.message})`); continue; }
    if (!slot) { skipped.push(`${id} (no free ${a.type} slot in window)`); continue; }
    reserved.push(slot.slot_iso);
    bookings.push({
      asset_id: a.asset_id, type: a.type, kind: a.kind, title: a.title || a.slug,
      media_path: a.media_path, caption: a.caption,
      slot_local: slot.slot_local, slot_iso: slot.slot_iso,
      status: 'pending', attempts: 0, li_result: '', updated_at_utc: utc(),
    });
  }
  return { bookings, calendar, skipped };
}

async function modeApply(opts) {
  if (!opts.ids || !opts.ids.length) throw new Error('apply needs --ids <id1,id2,...>');
  const run = async () => {
    const { bookings, calendar, skipped } = await book(opts);
    for (const s of skipped) console.log(`skip ${s}`);
    console.log(`to schedule: ${bookings.length}`);
    for (const b of bookings) console.log(`  ${b.slot_local}  ${b.type}/${b.kind}  ${b.asset_id}`);
    if (opts.dryRun) { console.log('dry-run: no calendar write, no browser'); return; }
    if (!bookings.length) return;
    const rows = [...calendar.filter((b) => !bookings.find((nb) => nb.asset_id === b.asset_id)), ...bookings];
    await writeCalendar(rows);
    await scheduleBookings(bookings, rows, opts);
  };
  // the read that picks slots and the pending write must sit under the same lock as the
  // LinkedIn loop, or a second run books from a stale calendar (dry-run only reads)
  return opts.dryRun ? run() : withCalendarLock(run);
}

/** Shared LinkedIn loop: schedule each pending booking, persisting calendar after every attempt. */
async function scheduleBookings(bookings, rows, opts) {
  // caller holds withCalendarLock (PACS0007)
  let abort = null;
  try {
  await runWithChrome(opts, async ({ page, sessionId, client }) => {
    await ensureLogin(page, opts);
    for (const b of bookings) {
      // Another run may have scheduled this asset while we were booking; a fresh read guards
      // against a double LinkedIn post before we spend the side effect.
      const live = (await loadCalendar()).find((r) => r.asset_id === b.asset_id && (r.status === 'scheduled' || r.status === 'verified'));
      if (live) {
        b.status = live.status; b.li_result = `already ${live.status} @ ${live.slot_local}, skipped`;
        b.attempts += 1; b.updated_at_utc = utc();
        console.log(`skip ${b.asset_id}: ${b.li_result}`);
        continue;
      }
      try {
        await clearTransientUi(page);
        await navigate(page, client, sessionId, 'https://www.linkedin.com/feed/');
        await new Promise((r) => setTimeout(r, 1500));
        const result = await scheduleOne(page, client, sessionId, b);
        b.status = 'scheduled'; b.li_result = result;
      } catch (error) {
        b.status = 'failed'; b.li_result = String(error.message || error).slice(0, 240);
        const hook = await saveHookReport(page, HOOKS_DIR, `fail-${b.asset_id.replace(/[^a-z0-9]+/gi, '_')}`).catch(() => '');
        const shot = await screenshot(page, SHOTS_DIR, `fail-${b.asset_id.replace(/[^a-z0-9]+/gi, '_')}`).catch(() => '');
        console.log(`failed ${b.asset_id}: ${b.li_result} hook=${hook} shot=${shot}`);
      }
      b.attempts += 1; b.updated_at_utc = utc();
      const merged = [...rows.filter((r) => r.asset_id !== b.asset_id), b];
      await writeCalendar(merged);
      rows.length = 0; rows.push(...merged);
      if (b.status === 'scheduled') console.log(b.li_result);
      await new Promise((r) => setTimeout(r, 3000));
    }
  });
  } catch (e) { abort = e; }
  finally {
    // A booking that never reached scheduleOne (login timeout, Chrome failed to launch, a crash
    // before its turn) never touched LinkedIn, so it is safe to release: flip it to failed so the
    // asset and its slot stop counting as live. Attempted rows keep their own outcome.
    const stranded = bookings.filter((b) => b.status === 'pending' && b.attempts === 0);
    if (stranded.length) {
      const why = `not attempted: ${String((abort && abort.message) || 'run ended early').slice(0, 200)}`;
      for (const b of stranded) { b.status = 'failed'; b.li_result = why; b.updated_at_utc = utc(); }
      const ids = new Set(stranded.map((b) => b.asset_id));
      await writeCalendar([...rows.filter((r) => !ids.has(r.asset_id)), ...stranded]);
      console.log(`released ${stranded.length} unattempted booking(s): ${why}`);
    }
  }
  if (abort) throw abort;
  const ok = bookings.filter((b) => b.status === 'scheduled').length;
  console.log(`done: ${ok}/${bookings.length} scheduled`);
}

/**
 * apply-plan: schedule assets into EXPLICIT slots picked in the Studio week planner.
 * Plan file: [{ asset_id, slot_iso, slot_local }]. Bypasses the parity pools on purpose
 * (that is the point of dragging), so fluxograms and any future managed type schedule fine.
 * Validation still refuses: unknown asset, manual_only, an asset with a live booking,
 * a slot already live-taken, a duplicate slot inside the plan, or a slot < 30 min away.
 */
async function modeApplyPlan(opts) {
  if (!opts.plan) throw new Error('apply-plan needs --plan <plan.json>');
  const plan = JSON.parse(await readFile(opts.plan, 'utf8'));
  if (!Array.isArray(plan) || !plan.length) throw new Error('plan file is empty');
  const run = async () => {
  const assets = await loadAssets();
  const byId = new Map(assets.map((a) => [a.asset_id, a]));
  const calendar = await loadCalendar();
  const liveByAsset = new Map(calendar.filter((b) => LIVE.has(b.status)).map((b) => [b.asset_id, b]));
  const liveSlots = new Set(calendar.filter((b) => LIVE.has(b.status)).map((b) => b.slot_iso));
  const seen = new Set();
  const bookings = [];
  const skipped = [];
  const minMs = Date.now() + 30 * 60e3;
  for (const p of plan) {
    const a = byId.get(p.asset_id);
    if (!a) { skipped.push(`${p.asset_id} (not in assets.json)`); continue; }
    if (a.manual_only) { skipped.push(`${p.asset_id} (manual_only)`); continue; }
    if (liveByAsset.has(p.asset_id)) { skipped.push(`${p.asset_id} (already ${liveByAsset.get(p.asset_id).status} @ ${liveByAsset.get(p.asset_id).slot_local})`); continue; }
    if (!p.slot_iso || Number.isNaN(Date.parse(p.slot_iso))) { skipped.push(`${p.asset_id} (bad slot_iso)`); continue; }
    if (Date.parse(p.slot_iso) < minMs) { skipped.push(`${p.asset_id} (slot ${p.slot_local || p.slot_iso} is in the past / < 30 min away)`); continue; }
    if (liveSlots.has(p.slot_iso)) { skipped.push(`${p.asset_id} (slot ${p.slot_local || p.slot_iso} already booked)`); continue; }
    if (seen.has(p.slot_iso)) { skipped.push(`${p.asset_id} (slot ${p.slot_local || p.slot_iso} duplicated in plan)`); continue; }
    seen.add(p.slot_iso);
    bookings.push({
      asset_id: a.asset_id, type: a.type, kind: a.kind, title: a.title || a.slug,
      media_path: a.media_path, caption: a.caption,
      slot_local: p.slot_local || p.slot_iso, slot_iso: p.slot_iso,
      status: 'pending', attempts: 0, li_result: '', updated_at_utc: utc(),
    });
  }
  for (const s of skipped) console.log(`skip ${s}`);
  console.log(`to schedule: ${bookings.length}`);
  for (const b of bookings) console.log(`  ${b.slot_local}  ${b.type}/${b.kind}  ${b.asset_id}`);
  if (opts.dryRun) { console.log('dry-run: no calendar write, no browser'); return; }
  if (!bookings.length) return;
  const rows = [...calendar.filter((b) => !bookings.find((nb) => nb.asset_id === b.asset_id)), ...bookings];
  await writeCalendar(rows);
  await scheduleBookings(bookings, rows, opts);
  };
  return opts.dryRun ? run() : withCalendarLock(run);
}

/**
 * Remove scheduled LinkedIn posts for the given asset ids and free their calendar slots.
 * The counterpart to apply: `unschedule --ids X` then `apply --ids X` cleanly replaces a post
 * (e.g. after fixing its caption). Only touches assets with a live booking; deleteScheduledPost
 * refuses to act unless exactly one scheduled post matches the booking's slot.
 */
async function modeUnschedule(opts) {
  if (!opts.ids || !opts.ids.length) throw new Error('unschedule needs --ids <id1,id2,...>');
  // PACS0007 — the whole read -> LinkedIn delete -> write runs under the calendar lock, so a
  // booking another run makes meanwhile cannot be overwritten by this run's stale snapshot
  const run = async () => {
  const calendar = await loadCalendar();
  const liveByAsset = new Map(calendar.filter((b) => LIVE.has(b.status)).map((b) => [b.asset_id, b]));
  const targets = [];
  for (const id of opts.ids) {
    const b = liveByAsset.get(id);
    if (!b) { console.log(`skip ${id} (no live booking)`); continue; }
    targets.push(b);
  }
  console.log(`to unschedule: ${targets.length}`);
  for (const b of targets) console.log(`  ${b.slot_local}  ${b.type}/${b.kind}  ${b.asset_id}`);
  if (opts.dryRun) { console.log('dry-run: no LinkedIn change, no calendar write'); return; }
  if (!targets.length) return;

  const removed = new Set();
  await runWithChrome(opts, async ({ page, sessionId, client }) => {
    await ensureLogin(page, opts);
    for (const b of targets) {
      try {
        await clearTransientUi(page);
        await navigate(page, client, sessionId, 'https://www.linkedin.com/feed/');
        await new Promise((r) => setTimeout(r, 1500));
        const result = await deleteScheduledPost(page, b.slot_local, { client, sessionId });
        console.log(`${b.asset_id}: ${result}`);
        removed.add(b.asset_id);
      } catch (error) {
        const msg = String(error.message || error).slice(0, 240);
        const shot = await screenshot(page, SHOTS_DIR, `unschedule-fail-${b.asset_id.replace(/[^a-z0-9]+/gi, '_')}`).catch(() => '');
        console.log(`failed ${b.asset_id}: ${msg} shot=${shot}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  });

  if (removed.size) await writeCalendar((await loadCalendar()).filter((b) => !removed.has(b.asset_id)));
  console.log(`done: ${removed.size}/${targets.length} unscheduled`);
  };
  return opts.dryRun ? run() : withCalendarLock(run);
}

async function modeDiscover(opts) {
  await runWithChrome(opts, async ({ page }) => {
    await ensureLogin(page, opts);
    const shot = await screenshot(page, SHOTS_DIR, 'discover').catch(() => '');
    console.log(`logged_in=true screenshot=${shot}`);
  });
}

/**
 * verify: read LinkedIn's own Scheduled tab and diff it against the calendar. The calendar records
 * intent and the publisher's own claim; LinkedIn's list is the only proof a post is actually booked.
 * Checks, for every live future booking: a row exists at that date and time and its caption starts
 * the same; flags duplicate slots; lists rows LinkedIn has that the calendar does not (informational,
 * e.g. posts scheduled by hand). Exits 1 on any missing row, caption mismatch or duplicate.
 */
async function modeVerify(opts) {
  const calendar = await loadCalendar();
  const now = Date.now();
  const expected = calendar.filter((b) => (b.status === 'scheduled' || b.status === 'verified') && Date.parse(b.slot_iso) > now + 60e3);
  console.log(`calendar: ${expected.length} live future bookings`);
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  let bad = false;
  await runWithChrome(opts, async ({ page }) => {
    await ensureLogin(page, opts);
    const list = await readScheduledList(page);
    const byWhen = new Map(list.entries.map((e) => [e.when, e]));
    const missing = []; const capBad = [];
    for (const b of expected) {
      const when = scheduledRowLabel(b.slot_local); const got = byWhen.get(when);
      if (!got) missing.push(`${b.asset_id} @ ${when}`);
      else if (!norm(got.cap).startsWith(norm(b.caption).slice(0, 25))) capBad.push(`${b.asset_id} @ ${when}: LinkedIn "${norm(got.cap).slice(0, 40)}" vs calendar "${norm(b.caption).slice(0, 40)}"`);
    }
    const expWhen = new Set(expected.map((b) => scheduledRowLabel(b.slot_local)));
    const extra = list.entries.filter((e) => !expWhen.has(e.when)).map((e) => `${e.when} "${norm(e.cap).slice(0, 40)}"`);
    const dup = list.entries.length - byWhen.size;
    console.log(`LinkedIn: Scheduled (${list.count}), ${list.entries.length} rows read`);
    for (const m of missing) console.log(`  MISSING on LinkedIn: ${m}`);
    for (const m of capBad) console.log(`  CAPTION MISMATCH: ${m}`);
    for (const m of extra) console.log(`  on LinkedIn, not in calendar: ${m}`);
    if (dup) console.log(`  DUPLICATE slots on LinkedIn: ${dup}`);
    if (list.count !== null && list.count !== list.entries.length) console.log(`  WARNING: label says ${list.count} but ${list.entries.length} rows were read`);
    bad = missing.length > 0 || capBad.length > 0 || dup > 0;
    await screenshot(page, SHOTS_DIR, 'verify').catch(() => '');
  });
  console.log(bad ? 'verify: MISMATCH' : 'verify: OK');
  if (bad) process.exitCode = 1;
}

async function main() {
  const opts = parseArgs();
  if (['help', '--help', '-h'].includes(opts.mode)) {
    console.log('Usage:\n  publish.mjs plan\n  publish.mjs discover [--headless]\n  publish.mjs apply --ids <id1,id2> [--dry-run] [--headless] [--max N]\n  publish.mjs apply-plan --plan <plan.json> [--dry-run] [--headless]\n  publish.mjs unschedule --ids <id1,id2> [--dry-run] [--headless]\n  publish.mjs verify [--headless]');
    return;
  }
  if (opts.mode === 'plan') return modePlan();
  if (opts.mode === 'apply-plan') return modeApplyPlan(opts);
  if (opts.mode === 'discover') return modeDiscover(opts);
  if (opts.mode === 'apply') return modeApply(opts);
  if (opts.mode === 'unschedule') return modeUnschedule(opts);
  if (opts.mode === 'verify') return modeVerify(opts);
  throw new Error(`Unknown mode: ${opts.mode}`);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
