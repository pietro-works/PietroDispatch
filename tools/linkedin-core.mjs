#!/usr/bin/env node
/**
 * linkedin-core.mjs — generalized LinkedIn native-scheduling engine for Pietro Studio.
 *
 * Adapted from the proven quote tool (pietro.works/gen/quote/tools/linkedin-native-scheduler.mjs).
 * Generalized so each post carries its own kind (image or document), media path, caption, and
 * a caption confirmation needle, instead of the hardwired 180-quote model. Reuses the SAME
 * dedicated Chrome profile so the login established once for quotes is shared.
 *
 * This is a library: publish.mjs drives it. It does no slot logic and owns no DB.
 */
import { mkdir, mkdtemp, readFile, stat, writeFile, access, unlink } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';

export const PROFILE_DIR = join(homedir(), '.codex-linkedin-scheduler', 'chrome-profile');
const CHROME_APP = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEEP_QUERY_HELPERS = `
  const deepElements = (root = document) => {
    const out = [];
    const visit = (node) => {
      if (!node) return;
      if (node.nodeType === Node.ELEMENT_NODE) { out.push(node); if (node.shadowRoot) visit(node.shadowRoot); }
      for (const child of node.children || []) visit(child);
    };
    visit(root);
    return out;
  };
  const deepQueryAll = (selector) => deepElements().filter((el) => el.matches?.(selector));
  const deepQuery = (selector) => deepQueryAll(selector)[0] || null;
`;

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Caption confirmation needle: a distinctive word LinkedIn's editor won't mangle. */
export function captionNeedle(caption) {
  const firstLine = (caption || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  const words = firstLine.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 5);
  if (words.length) return words.sort((a, b) => b.length - a.length)[0];
  return firstLine.slice(0, 12) || (caption || '').slice(0, 12);
}

async function exists(p) { try { await access(p, FS.X_OK); return true; } catch { return false; } }
export async function resolveChrome(x) {
  if (x) return x;
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  if (await exists(CHROME_APP)) return CHROME_APP;
  for (const c of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium']) if (await exists(c)) return c;
  return CHROME_APP;
}

export class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.nextId = 1; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej, timer } = this.pending.get(msg.id); clearTimeout(timer); this.pending.delete(msg.id);
        msg.error ? rej(new Error(`${msg.error.message}: ${JSON.stringify(msg.error.data || '')}`)) : res(msg.result || {});
      } else if (msg.method && this.listeners.has(msg.method)) { for (const l of this.listeners.get(msg.method)) l(msg); }
    });
  }
  async call(method, params = {}, sessionId) {
    await this.ready; const id = this.nextId++; const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
    const p = new Promise((res, rej) => { const timer = setTimeout(() => { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); }, 45000); this.pending.set(id, { res, rej, timer }); });
    this.ws.send(JSON.stringify(payload)); return p;
  }
  once(method, sessionId) {
    return new Promise((res) => { const l = (m) => { if (sessionId && m.sessionId !== sessionId) return; const arr = this.listeners.get(method) || []; this.listeners.set(method, arr.filter((x) => x !== l)); res(m.params || {}); }; const arr = this.listeners.get(method) || []; arr.push(l); this.listeners.set(method, arr); });
  }
  close() { this.ws.close(); }
}

export async function launchChrome({ headless = false, chrome } = {}) {
  await mkdir(PROFILE_DIR, { recursive: true });
  const portFile = join(PROFILE_DIR, 'DevToolsActivePort');
  await unlink(portFile).catch(() => {});
  const bin = await resolveChrome(chrome);
  const args = ['--remote-debugging-port=0', `--user-data-dir=${PROFILE_DIR}`, '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--lang=en-US', '--window-size=1440,1200'];
  // No --disable-gpu: LinkedIn's media editor stalls on "Loading" without it.
  if (headless) args.push('--headless=new');
  args.push('https://www.linkedin.com/feed/');
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; proc.stderr.on('data', (c) => { stderr += c.toString(); });
  let port = null, version = null;
  for (let i = 0; i < 150; i += 1) {
    try { port = Number((await readFile(portFile, 'utf8')).split('\n')[0]); if (port) { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } }
    catch { await sleep(100); }
  }
  if (!version) { proc.kill('SIGKILL'); throw new Error(`Chrome did not expose DevTools port. ${stderr.slice(0, 600)}`); }
  return { proc, wsUrl: version.webSocketDebuggerUrl };
}

export async function closeChrome(chrome, client, keepOpen = false) {
  if (keepOpen) return;
  try { if (client) await client.call('Browser.close'); } catch {}
  await new Promise((res) => { const t = setTimeout(() => { try { chrome.proc.kill('SIGKILL'); } catch {} res(); }, 3000); chrome.proc.once('exit', () => { clearTimeout(t); res(); }); });
}

export async function createLinkedInPage(client) {
  const targets = await client.call('Target.getTargets');
  const target = targets.targetInfos.find((i) => i.type === 'page' && i.url.includes('linkedin.com')) || targets.targetInfos.find((i) => i.type === 'page');
  const { sessionId } = await client.call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = (m, p = {}) => client.call(m, p, sessionId);
  await page('Page.enable'); await page('Runtime.enable'); await page('DOM.enable'); await page('Page.bringToFront');
  // Headless Chrome announces itself as "HeadlessChrome"; present as the ordinary browser so LinkedIn serves the same composer and media editor as headful.
  try {
    const ua = (await client.call('Browser.getVersion')).userAgent;
    if (/HeadlessChrome/.test(ua)) await page('Emulation.setUserAgentOverride', { userAgent: ua.replace('HeadlessChrome', 'Chrome') });
  } catch {}
  return { page, sessionId };
}

export async function navigate(page, client, sessionId, url) {
  const loaded = client.once('Page.loadEventFired', sessionId).catch(() => false);
  try { await page('Page.navigate', { url }); } catch (e) { if (!/Page\.navigate/i.test(String(e.message || e))) throw e; }
  await Promise.race([loaded, sleep(15000)]);
  await waitFor(page, `
    (() => { const text = document.body?.innerText || ''; return document.readyState !== 'loading' && (
      location.href.includes('linkedin.com/feed') || text.includes('Start a post') ||
      Boolean(document.querySelector('[data-test-global-nav-link="feed"], a[href*="/feed/"]'))); })()
  `, 20000, 'LinkedIn feed shell').catch(() => false);
  await sleep(1500);
}

export async function evaluate(page, expression, awaitPromise = false) {
  const result = await page('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  return result.result?.value;
}

export async function waitFor(page, expression, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await evaluate(page, `Boolean(${expression})`)) return true; } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label || expression}`);
}

export async function isLoggedIn(page) {
  try {
    return Boolean(await evaluate(page, `
      !location.href.includes('/login') && !location.href.includes('/checkpoint') && (
        document.body.innerText.includes('Start a post') ||
        Boolean(document.querySelector('[data-test-global-nav-link="feed"]')) ||
        Boolean(document.querySelector('a[href*="/feed/"]')))
    `));
  } catch { return false; }
}

export async function waitForLogin(page, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) { if (await isLoggedIn(page)) return true; await sleep(1000); }
  return false;
}

export async function saveHookReport(page, dir, label) {
  await mkdir(dir, { recursive: true });
  const report = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
      const items = deepQueryAll('button,[role="button"],input,textarea,[contenteditable="true"]').slice(0, 260).map((el) => ({
        tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', type: el.getAttribute('type') || '',
        aria: clean(el.getAttribute('aria-label')), title: clean(el.getAttribute('title')), placeholder: clean(el.getAttribute('placeholder')),
        text: clean(el.innerText || el.value || ''), disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true') }));
      return { url: location.href, title: document.title, captured_at: new Date().toISOString(), items };
    })()
  `);
  const path = join(dir, `${new Date().toISOString().replace(/[:.]/g, '').replace('Z', 'Z')}-${label}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

export async function screenshot(page, dir, label) {
  await mkdir(dir, { recursive: true });
  const shot = await page('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const path = join(dir, `${new Date().toISOString().replace(/[:.]/g, '')}-${label}.png`);
  await writeFile(path, Buffer.from(shot.data, 'base64'));
  return path;
}

async function clickByText(page, candidates, label) {
  const value = JSON.stringify(candidates.map((i) => i.toLowerCase()));
  const hit = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const candidates = ${value};
      const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; };
      const score = (el) => {
        const t = clean(el.innerText || el.value || ''); const a = clean([el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder')].join(' ')); const txt = clean([t, a].join(' '));
        if (!txt) return 0;
        for (let i = 0; i < candidates.length; i += 1) { if (t === candidates[i]) return 140 - i; if (a === candidates[i]) return 120 - i; if (txt === candidates[i]) return 100 - i; if (txt.includes(candidates[i])) return 70 - i; }
        return 0; };
      const els = deepQueryAll('button,[role="button"],a,input,textarea,span,div').filter(visible);
      const best = els.map((el) => ({ el, s: score(el) })).filter((i) => i.s > 0).sort((a, b) => b.s - a.s)[0];
      if (!best) return false;
      const tgt = best.el.closest('button,[role="button"],a,label') || best.el; tgt.scrollIntoView({ block: 'center' });
      const r = tgt.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()
  `);
  if (!hit) throw new Error(`Could not click ${label}: ${candidates.join(' | ')}`);
  await mouseClick(page, hit.x, hit.y);
}

async function clickBySelector(page, selector, label) {
  const hit = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const el = deepQuery(${JSON.stringify(selector)}); if (!el) return false;
      const tgt = el.closest('button,[role="button"],a,label') || el;
      if (tgt.disabled || tgt.getAttribute('aria-disabled') === 'true') return false;
      tgt.scrollIntoView({ block: 'center' }); const r = tgt.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()
  `);
  if (!hit) throw new Error(`Could not click ${label}: ${selector}`);
  await mouseClick(page, hit.x, hit.y);
}

async function clickExactButton(page, candidates, label) {
  const value = JSON.stringify(candidates.map((i) => i.toLowerCase()));
  const hit = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const candidates = ${value};
      const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; };
      const best = deepQueryAll('button,[role="button"]').filter(visible).map((el) => { const t = clean(el.innerText || el.value || ''); const a = clean(el.getAttribute('aria-label') || ''); let s = 0; for (let i = 0; i < candidates.length; i += 1) { if (t === candidates[i]) s = Math.max(s, 200 - i); else if (a === candidates[i]) s = Math.max(s, 160 - i); } return { el, s }; }).filter((i) => i.s > 0).sort((a, b) => b.s - a.s)[0];
      if (!best) return false; best.el.scrollIntoView({ block: 'center' }); const r = best.el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()
  `);
  if (!hit) throw new Error(`Could not click ${label}: ${candidates.join(' | ')}`);
  await mouseClick(page, hit.x, hit.y);
}

/*
 * LinkedIn composer/scheduler UI reference (verified against the English UI, 2026-10).
 * LinkedIn restyles this often; every drift so far broke a selector, so keep this list current.
 *
 * Feed: "Start a post" opens the composer as a native <dialog> (no role="dialog", no .artdeco-modal).
 *   Hover tooltips are tiny role="dialog" divs (about 54x36), so dialog scope ignores anything
 *   under 200x120. The editor is a ProseMirror div[role=textbox].
 * Composer toolbar (aria-label, exact): "Media", "Expand content types" (toggles to "Collapse content
 *   types"; reveals <a aria-label="Document">, Poll, Event, Job, Celebration), and the clock, an
 *   <a aria-label="Scheduled"> (not a button). The submit button reads "Post", or "Schedule" once a
 *   time is confirmed.
 * Media: after the file lands a media Editor opens (Back / Next); its Next must be clicked first.
 * Document: "Document" link, then a "Share a document" step with "Choose file", a title input, and
 *   "Done", which is an <a aria-disabled> that enables once the upload finishes.
 * Schedule dialog: tabs "Schedule post" and "Scheduled (N)". Date input (placeholder mm/dd/yyyy) and
 *   a time input ("9:00 AM") whose dropdown row must be clicked, then one "Confirm". Both inputs need
 *   trusted input (Input.insertText); the native value setter is ignored by LinkedIn's React state.
 * Scheduled tab: one row per post, a link "Posting <Dow, Mon D, YYYY at H:MM AM/PM>" plus a
 *   div[role=button] wrapping svg[aria-label="More options"]. The list is lazy-loaded on scroll. That
 *   menu is role=menu with "Post now", "Modify schedule", "Edit post", "Delete post". Never click
 *   anything but the exact "Delete post" item ("Post now" publishes immediately).
 */
export const LI_UI = {
  toolbar: { addMedia: 'Media', more: 'Expand content types', schedule: 'Scheduled' },
  moreMenu: { addDocument: 'Document' },
};

// Restrict deep queries to the topmost visible dialog (composer / modal), falling back to the
// whole document only when no dialog is open. This is what keeps feed decoys out of every click.
export const DIALOG_SCOPE = `
  ${DEEP_QUERY_HELPERS}
  const _vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  // Messaging chat windows and other page overlays are role="dialog" nodes too (about 216x696) and sort after the composer in DOM order, so "the last dialog" used to land inside a chat window and every scoped click then missed. Exclude them; among the rest the last in DOM order is the topmost, so a stacked confirmation still wins over the composer.
  const activeDialog = (() => {
    const overlay = '[class*="msg-overlay"], [class*="msg-convo"], #msg-overlay, aside';
    const dlgs = deepQueryAll('[role="alertdialog"], [role="dialog"], dialog, .artdeco-modal').filter(_vis).filter((d) => { const r = d.getBoundingClientRect(); return r.width >= 200 && r.height >= 120 && !d.closest(overlay); });
    return dlgs.length ? dlgs[dlgs.length - 1] : document;
  })();
  // The size floor excludes hover tooltips: LinkedIn renders them as a tiny role="dialog" div (about 54x36), which otherwise becomes "the topmost dialog" the moment the mouse rests on the toolbar and every scoped click then searches inside the tooltip.
  const scopedAll = (selector) => deepElements(activeDialog).filter((el) => el.matches?.(selector));
`;

/**
 * Click a control inside the active dialog by exact aria-label, aria substring, or exact/substring
 * text, in that priority. Scoped to the composer/modal so a matching feed control is never hit.
 * spec: { exactAria?: string[], includesAria?: string[], texts?: string[] } (all lowercased here).
 */
export async function clickInDialog(page, spec, label) {
  const exactAria = (spec.exactAria || []).map((s) => s.toLowerCase());
  const includesAria = (spec.includesAria || []).map((s) => s.toLowerCase());
  const texts = (spec.texts || []).map((s) => s.toLowerCase());
  const probe = () => evaluate(page, `
    (() => {
      ${DIALOG_SCOPE}
      const clickable = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; };
      const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const exactAria = ${JSON.stringify(exactAria)}; const includesAria = ${JSON.stringify(includesAria)}; const texts = ${JSON.stringify(texts)};
      const score = (el) => {
        const a = clean(el.getAttribute('aria-label')); const t = clean(el.innerText || el.value || '');
        if (exactAria.includes(a)) return 100;
        if (includesAria.some((w) => a.includes(w))) return 80;
        if (texts.some((w) => t === w)) return 70;
        if (texts.some((w) => t.includes(w))) return 50;
        return 0;
      };
      const best = scopedAll('button,[role="button"],a,[role="menuitem"]').filter(clickable).map((el) => ({ el, s: score(el) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
      if (!best) return false;
      const tgt = best.el.closest('button,[role="button"],a,[role="menuitem"]') || best.el;
      tgt.scrollIntoView({ block: 'center' }); const r = tgt.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()
  `);
  // LinkedIn renders the composer toolbar a beat after the dialog opens, and slower headless, so
  // wait for the control to exist instead of failing on the first probe.
  let hit = await probe();
  for (let waited = 0; !hit && waited < (spec.waitMs ?? 8000); waited += 250) { await sleep(250); hit = await probe(); }
  if (!hit) throw new Error(`Could not click ${label} in dialog`);
  await mouseClick(page, hit.x, hit.y);
}

async function mouseClick(page, x, y) {
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function pressEscape(page) {
  await page('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
}

export async function clearTransientUi(page) {
  for (let i = 0; i < 2; i += 1) { await pressEscape(page).catch(() => {}); await sleep(250); }
}

async function isComposerOpen(page) {
  return Boolean(await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const hasDialog = deepQueryAll('[role="dialog"], dialog, .artdeco-modal').some(visible);
      const hasEditor = deepQueryAll('[contenteditable="true"], textarea').some(visible);
      return hasDialog && hasEditor;
    })()
  `));
}

export async function openComposer(page) {
  const candidates = ['start a post', 'start post', 'create a post', 'zacznij publikację', 'zacznij publikacje', 'rozpocznij publikację', 'rozpocznij publikacje', 'utwórz post'];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await isComposerOpen(page)) return;
    try { await clickByText(page, candidates, 'Start a post'); } catch {}
    // Give the dialog time to render (slower headless) before a second click, which would fight a half-open composer.
    for (let waited = 0; waited < 10000; waited += 500) { await sleep(500); if (await isComposerOpen(page)) return; }
  }
  throw new Error('Could not open composer dialog');
}

async function focusComposer(page) {
  const target = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const editable = deepQueryAll('[contenteditable="true"], textarea').filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (editable) { editable.focus(); const r = editable.getBoundingClientRect(); return { x: Math.round(r.left + 24), y: Math.round(r.top + 24), focused: true }; }
      return null;
    })()
  `);
  if (target && !target.focused) await mouseClick(page, target.x, target.y);
}

const EDITOR_QUERY = `deepQueryAll('[contenteditable="true"][role="textbox"], [contenteditable="true"], textarea').filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]`;

async function setComposerCaption(page, caption, needle) {
  // focus and clear the editor
  const focused = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const e = ${EDITOR_QUERY};
      if (!e) return false;
      e.focus();
      const sel = getSelection(); if (sel) { const range = document.createRange(); range.selectNodeContents(e); sel.removeAllRanges(); sel.addRange(range); }
      document.execCommand('delete', false, null);
      return true;
    })()
  `);
  if (!focused) throw new Error('Could not focus composer editor');

  // Type the caption. execCommand('insertText') stops at the first newline, silently
  // dropping every paragraph after the hook. Real CDP key input with an Enter between
  // lines preserves the whole multi-line body. Each line goes in as one insertText so
  // hashtag/mention autocomplete never fires mid-line.
  const lines = String(caption).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) {
      await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    }
    if (lines[i]) await page('Input.insertText', { text: lines[i] });
  }

  // verify BOTH the first-line hook and the last non-blank line landed, so a truncation
  // can never pass silently again (the old check only looked at the first line).
  const last = lines.map((s) => s.trim()).filter(Boolean).pop() || '';
  const tailWords = last.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4);
  const tailNeedle = tailWords.sort((a, b) => b.length - a.length)[0] || last.slice(0, 8);
  const check = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const e = ${EDITOR_QUERY};
      const t = e ? (e.innerText || e.value || '') : '';
      return { hasHead: t.includes(${JSON.stringify(needle)}), hasTail: t.includes(${JSON.stringify(tailNeedle)}), len: t.length };
    })()
  `);
  if (!check?.hasHead || !check?.hasTail) throw new Error(`Caption incomplete after insert (head=${check?.hasHead} tail=${check?.hasTail}, needles "${needle}"/"${tailNeedle}", len=${check?.len})`);
}

async function setFileInput(page, client, sessionId, image) {
  let chooserPromise = null;
  try { await page('Page.setInterceptFileChooserDialog', { enabled: true }); chooserPromise = client.once('Page.fileChooserOpened', sessionId); } catch {}
  return { chooserPromise, done: async () => { await page('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {}); } };
}

async function applyFile(page, client, sessionId, file, chooserPromise) {
  const chooser = chooserPromise ? await Promise.race([chooserPromise, sleep(2500).then(() => null)]) : null;
  if (chooser?.backendNodeId) { await page('DOM.setFileInputFiles', { backendNodeId: chooser.backendNodeId, files: [file] }); return; }
  await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} return deepQueryAll('input[type="file"]').find((i) => !i.closest('[class*="msg-overlay"], [class*="msg-convo"], #msg-overlay')); })()`, 15000, 'file input');
  const fileInput = await page('Runtime.evaluate', { expression: `(() => { ${DEEP_QUERY_HELPERS} return deepQueryAll('input[type="file"]').find((i) => !i.closest('[class*="msg-overlay"], [class*="msg-convo"], #msg-overlay')); })()`, returnByValue: false });
  const objectId = fileInput.result?.objectId;
  if (!objectId) throw new Error('Could not locate LinkedIn file input');
  await page('DOM.setFileInputFiles', { objectId, files: [file] });
}

async function attachImage(page, client, sessionId, image) {
  // No file-chooser interception here: with Page.setInterceptFileChooserDialog on, LinkedIn's media editor never leaves its "Loading" state. The editor mounts a body-level <input type=file>, so set the file on that directly.
  const chooserPromise = null; const done = async () => {};
  try {
    // Scoped to the composer dialog first: page-wide aria matches can land on a feed or chat control.
    let clicked = await clickInDialog(page, { exactAria: [LI_UI.toolbar.addMedia, 'Add media'], waitMs: 6000 }, 'Add media').then(() => true, () => false);
    if (!clicked) for (const sel of ['button[aria-label="Add media"]', 'button[aria-label*="media" i]', 'button[aria-label*="photo" i]', 'button[aria-label*="image" i]', 'button[aria-label*="zdj" i]', 'button[aria-label*="obraz" i]']) { try { await clickBySelector(page, sel, 'Add media'); clicked = true; break; } catch {} }
    if (!clicked) await clickByText(page, ['add media', 'media', 'photo', 'image', 'dodaj multimedia', 'multimedia', 'zdjęcie', 'zdjecie', 'obraz'], 'Add media');
    await applyFile(page, client, sessionId, image, chooserPromise);
    // LinkedIn now opens a media Editor (Back / Next) once the file lands. Escape cancels that editor
    // and silently drops the image, so wait for its Next to enable and let advanceMediaEditor click
    // it. Escape stays only as the legacy fallback for a UI that shows no editor.
    const editorReady = await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }; return deepQueryAll('button').some((el) => vis(el) && /^(next|dalej|done|gotowe)$/i.test(String(el.innerText || '').trim())); })()`, 20000, 'media editor Next').then(() => true).catch(() => false);
    if (!editorReady) { await sleep(600); await pressEscape(page); }
  } finally { await done(); }
}

async function attachDocument(page, client, sessionId, pdf, title) {
  const { chooserPromise, done } = await setFileInput(page, client, sessionId, pdf);
  try {
    // Current UI: the composer's "Expand content types" toggle reveals an <a aria-label="Document">,
    // which opens a "Share a document" step with its own "Choose file" button. Legacy UI: "More" then
    // "Add a document". Everything is scoped to the active composer dialog so a feed decoy
    // ("View more options", "Go to next page of document") can never be hit.
    const DOC_ARIA = { exactAria: ['Document', LI_UI.moreMenu.addDocument, 'dodaj dokument'], includesAria: ['add a document'] };
    let picked = false;
    for (let attempt = 0; attempt < 3 && !picked; attempt += 1) {
      picked = await clickInDialog(page, DOC_ARIA, 'Document').then(() => true).catch(() => false);
      if (picked) break;
      await clickInDialog(page, { exactAria: ['Expand content types', LI_UI.toolbar.more, 'więcej', 'wiecej'] }, 'content types toggle').catch(() => {});
      await sleep(900);
      picked = await clickInDialog(page, DOC_ARIA, 'Document').then(() => true).catch(() => false);
    }
    if (!picked) throw new Error('Could not open the document option from the composer');
    // Current UI raises the file chooser from "Choose file"; the legacy menu item raised it directly.
    await sleep(1500);
    await clickInDialog(page, { texts: ['choose file', 'wybierz plik'] }, 'Choose file').catch(() => {});
    await applyFile(page, client, sessionId, pdf, chooserPromise);
    await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} return deepQueryAll('input[type="text"], input:not([type])').some((el) => el.offsetWidth > 0 && /title|name|nazwa|tytu/i.test([el.placeholder, el.getAttribute('aria-label'), el.name, el.id].join(' '))); })()`, 20000, 'document title field').catch(() => {});
    // Type the title with real CDP key input, the SAME trusted path the caption uses. Writing
    // input.value through the native setter leaves LinkedIn's React state believing the title is
    // still empty, so the "Done" button never enables; both click helpers correctly refuse a
    // disabled button, so the flow can never reach the schedule control and dies at "Could not
    // reach schedule control after attach". Focus + select, then Input.insertText, so React sees it.
    const docTitle = String(title || 'Pietro.works');
    const titleSel = `deepQueryAll('input[type="text"], input:not([type])').filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0).find((el) => /title|name|nazwa|tytu/i.test([el.placeholder, el.getAttribute('aria-label'), el.name, el.id].join(' '))) || deepQueryAll('input[type="text"], input:not([type])').filter((el) => el.offsetWidth > 0)[0]`;
    const titleFocused = await evaluate(page, `
      (() => {
        ${DEEP_QUERY_HELPERS}
        const input = ${titleSel};
        if (!input) return false;
        input.focus(); input.select();
        return true;
      })()
    `);
    if (!titleFocused) throw new Error('Could not focus document title field');
    await page('Input.insertText', { text: docTitle });
    await sleep(300);
    // Confirm the value actually holds; if a stale value survived, clear it and retype once.
    let heldTitle = await evaluate(page, `(() => { ${DEEP_QUERY_HELPERS} const input = ${titleSel}; return input ? String(input.value || '') : ''; })()`);
    if (!String(heldTitle).includes(docTitle.slice(0, 8))) {
      await evaluate(page, `(() => { ${DEEP_QUERY_HELPERS} const input = ${titleSel}; if (input) { input.focus(); input.select(); } return true; })()`);
      await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
      await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
      await page('Input.insertText', { text: docTitle });
      await sleep(300);
      heldTitle = await evaluate(page, `(() => { ${DEEP_QUERY_HELPERS} const input = ${titleSel}; return input ? String(input.value || '') : ''; })()`);
    }
    if (!String(heldTitle).includes(docTitle.slice(0, 8))) throw new Error(`Document title did not register (got "${heldTitle}")`);
    // "Done" is an <a aria-disabled>, not a <button>, and stays disabled until the PDF has finished
    // uploading (about 10s for 13 MB). Wait for it to be enabled, then click it through the dialog-scoped
    // helper, which handles links and refuses a disabled control.
    await waitFor(page, `
      (() => {
        ${DIALOG_SCOPE}
        const cands = ['done', 'next', 'gotowe', 'dalej'];
        const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const ok = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; };
        return scopedAll('button,[role="button"],a').some((el) => ok(el) && cands.includes(clean(el.innerText || el.value || '')));
      })()
    `, 120000, 'document upload finished (Done enabled)');
    for (let i = 0; i < 6; i += 1) { if (await isScheduleControlVisible(page)) break; try { await clickInDialog(page, { texts: ['done', 'next', 'gotowe', 'dalej'] }, 'doc done/next'); } catch {} await sleep(1500); }
  } finally { await done(); }
}

async function isScheduleControlVisible(page) {
  return Boolean(await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; };
      // The composer stays mounted under the media Editor, so its clock exists but is covered; count it only when it is the topmost element at its centre.
      const onTop = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(t) && (t === el || el.contains(t) || t.contains(el)); };
      return deepQueryAll('button,[role="button"],a').some((el) => { const l = String([el.innerText, el.getAttribute('aria-label'), el.getAttribute('title')].join(' ')).toLowerCase(); return visible(el) && (/schedule post|zaplanuj publikacj/.test(l) || (el.tagName === 'A' && String(el.getAttribute('aria-label') || '').toLowerCase() === 'scheduled' && onTop(el))); });
    })()
  `));
}

async function advanceMediaEditor(page) {
  // The media Editor (Back / Next) can stay open over a composer whose clock is still reachable by
  // hit-test when the caption is long, because the composer grows taller than the Editor. So a visible,
  // enabled Next always wins over the clock check; only when no Editor is open does the clock count.
  const editorOpen = () => evaluate(page, `(() => { ${DEEP_QUERY_HELPERS} return deepQueryAll('button').some((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && /^(next|dalej)$/i.test(String(el.innerText || '').trim()); }); })()`);
  for (let i = 0; i < 8; i += 1) {
    if (!await editorOpen() && await isScheduleControlVisible(page)) return;
    let moved = false;
    for (const c of [['next', 'dalej'], ['done', 'gotowe']]) { try { await clickExactButton(page, c, c[0]); moved = true; await sleep(1500); break; } catch {} }
    if (!moved) await sleep(1000);
  }
  if (await editorOpen() || !await isScheduleControlVisible(page)) throw new Error('Could not reach schedule control after attach');
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function setScheduleInputs(page, slotLocal) {
  const m = slotLocal.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) /);
  if (!m) throw new Error(`Bad schedule slot: ${slotLocal}`);
  const [, year, month, day, hh, mm] = m;
  const h12 = `${((Number(hh) + 11) % 12) + 1}:${mm} ${Number(hh) < 12 ? 'AM' : 'PM'}`;
  const found = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const ins = deepQueryAll('input').filter(vis).filter((el) => ['text', 'date', 'time', ''].includes(el.type));
      const di = deepQuery('#share-post__scheduled-date') || ins.find((el) => /yyyy|rrrr|date|data/i.test([el.placeholder, el.getAttribute('aria-label'), el.name, el.id].join(' '))) || ins[0];
      const ti = deepQuery('#share-post__scheduled-time') || ins.find((el) => el !== di && /time|hour|godz|czas/i.test([el.placeholder, el.getAttribute('aria-label'), el.name, el.id].join(' '))) || ins.filter((el) => el !== di)[0];
      if (!di || !ti) return null;
      di.setAttribute('data-pe-sched', 'date'); ti.setAttribute('data-pe-sched', 'time');
      return { datePh: String(di.placeholder || '').toLowerCase(), timeVal: String(ti.value || '') };
    })()
  `);
  if (!found) throw new Error('Could not locate schedule date/time inputs');
  // Real CDP input, not the native value setter: LinkedIn's React state ignores programmatic writes,
  // so the setter version left the schedule dialog on its default date/time.
  const typeInto = async (kind, text) => {
    const at = await evaluate(page, `(() => { ${DEEP_QUERY_HELPERS} const el = deepQuery('[data-pe-sched="${kind}"]'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    if (!at) throw new Error(`schedule ${kind} input vanished`);
    await mouseClick(page, at.x, at.y); await sleep(300);
    await evaluate(page, `(() => { ${DEEP_QUERY_HELPERS} const el = deepQuery('[data-pe-sched="${kind}"]'); el.focus(); el.select(); return true; })()`);
    await page('Input.insertText', { text });
    await sleep(600);
  };
  let dateStr = `${Number(month)}/${Number(day)}/${year}`;
  if (/yyyy[\/.-]mm[\/.-]dd/.test(found.datePh)) dateStr = `${year}-${month}-${day}`;
  else if (/dd[\/.-]mm/.test(found.datePh)) dateStr = `${day}/${month}/${year}`;
  const timeStr = /am|pm/i.test(found.timeVal) ? h12 : `${hh}:${mm}`;
  await typeInto('date', dateStr);
  await typeInto('time', timeStr);
  // The time field opens a dropdown that covers Confirm. Clicking its row commits the value and closes it.
  const row = await evaluate(page, `
    (() => {
      ${DEEP_QUERY_HELPERS}
      const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const dlg = [...document.querySelectorAll('dialog, [role="dialog"]')].filter(vis).pop() || document.body;
      const want = ${JSON.stringify(timeStr)};
      const els = [...dlg.querySelectorAll('*')].filter(vis).filter((e) => e.tagName !== 'INPUT' && String(e.innerText || '').trim() === want);
      const el = els.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
      if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()
  `);
  if (row) await mouseClick(page, row.x, row.y);
  else { await page('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 48 }); await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 48 }); }
  await sleep(900);
  // The dialog states what it will do ("Posting at Fri, Oct 9, 9:00 AM"). A wrong slot would post at
  // the wrong time with no error, so refuse to continue unless that line matches the booking.
  const summary = await evaluate(page, `(() => { const t = String(document.body.innerText || '').replace(/\\s+/g, ' '); const x = t.match(/Posting at (.+?) (?:Confirm|Edit|Schedule)\\b/i); return x ? x[1] : ''; })()`);
  if (summary && /am|pm/i.test(timeStr)) {
    const wantDate = `${MONTHS_EN[Number(month) - 1]} ${Number(day)}`;
    if (!summary.includes(wantDate) || !summary.includes(timeStr)) throw new Error(`Schedule summary mismatch: LinkedIn shows "${summary}", booking wants ${wantDate}, ${timeStr}`);
  }
}

/**
 * Schedule one post. booking: { kind:'image'|'document', media_path, caption, slot_local, title }.
 * Throws on any failure; caller captures hook + screenshot. Returns a short result string.
 */
export async function scheduleOne(page, client, sessionId, booking) {
  const file = booking.media_path;
  await stat(file);
  const needle = captionNeedle(booking.caption);
  await openComposer(page);
  await focusComposer(page);
  await setComposerCaption(page, booking.caption, needle);
  await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} return [document.body.innerText || '', ...deepQueryAll('[contenteditable="true"], textarea, input').map((el) => el.innerText || el.value || '')].join('\\n').includes(${JSON.stringify(needle)}); })()`, 15000, 'caption insertion');
  await sleep(700);
  if (booking.kind === 'document') await attachDocument(page, client, sessionId, file, booking.title);
  else await attachImage(page, client, sessionId, file);
  await sleep(2500);
  await advanceMediaEditor(page);
  await sleep(800);
  // Clock: legacy <button aria-label="Schedule post">, or the current <a aria-label="Scheduled">.
  await clickBySelector(page, 'button[aria-label="Schedule post"]', 'schedule control')
    .catch(() => clickBySelector(page, 'a[aria-label="Scheduled"]', 'schedule control'))
    .catch(async () => { await clickByText(page, ['schedule post', 'schedule', 'zaplanuj publikację', 'zaplanuj'], 'schedule control'); });
  await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; return Boolean(deepQuery('#share-post__scheduled-date') && deepQuery('#share-post__scheduled-time')) || deepQueryAll('input').filter(vis).some((el) => /yyyy|rrrr/i.test(el.placeholder || '')); })()`, 15000, 'schedule inputs');
  await setScheduleInputs(page, booking.slot_local);
  // Current UI: one "Confirm" returns to the composer, whose submit button is now "Schedule".
  // Legacy UI: "Next", then "Schedule".
  const hasConfirm = Boolean(await evaluate(page, `(() => { ${DEEP_QUERY_HELPERS} return deepQueryAll('button').some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled && /^(confirm|potwierdź|potwierdz)$/i.test(String(el.innerText || '').trim()); }); })()`));
  if (hasConfirm) await clickExactButton(page, ['confirm', 'potwierdź', 'potwierdz'], 'schedule Confirm');
  else {
    await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} const n = deepQuery('button[aria-label="Next"]') || deepQueryAll('button').find((el) => /^next$/i.test(String(el.innerText || '').trim())); return n && !n.disabled && n.getAttribute('aria-disabled') !== 'true'; })()`, 8000, 'enabled Next');
    await clickBySelector(page, 'button[aria-label="Next"]', 'schedule Next').catch(async () => { await clickExactButton(page, ['next', 'dalej'], 'schedule Next'); });
  }
  // The composer re-renders after Confirm and can sit on a loading skeleton for a few seconds.
  // Wait for the submit button to exist and be enabled instead of clicking after a fixed sleep.
  await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} return deepQueryAll('button').some((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && /^(schedule|zaplanuj)$/i.test(String(el.innerText || '').trim()); }); })()`, 30000, 'final Schedule button');
  await sleep(600);
  await clickExactButton(page, ['schedule', 'zaplanuj'], 'final Schedule');
  // Success = the composer closed. NOT a page-text match: the composer now carries a "Scheduled"
  // link, so a /scheduled/ text test is already true before anything is booked.
  await waitFor(page, `(() => { ${DEEP_QUERY_HELPERS} const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }; return !(deepQueryAll('[role="dialog"], dialog, .artdeco-modal').some(vis) && deepQueryAll('[contenteditable="true"], textarea').some(vis)); })()`, 90000, 'composer closed after Schedule');
  await sleep(1500);
  return `scheduled ${booking.kind} ${basename(file)} @ ${booking.slot_local}`;
}

/** Split a slot_local ("YYYY-MM-DD HH:MM ...") into the labels LinkedIn's manager renders. */
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The text LinkedIn renders for a booking in the Scheduled tab, e.g. "Fri, Oct 9, 2026 at 9:00 AM". */
export function scheduledRowLabel(slotLocal) {
  const m = String(slotLocal).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) throw new Error(`Bad slot_local: ${slotLocal}`);
  const [, y, mo, d, hh, mm] = m; const h = Number(hh);
  const dow = DOW3[new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()];
  return `${dow}, ${MON3[Number(mo) - 1]} ${Number(d)}, ${y} at ${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Open the schedule dialog's "Scheduled (N)" tab, the list of booked posts:
 * composer -> clock -> Scheduled tab. (The old separate "Scheduled posts manager" page is gone.)
 */
export async function openScheduledPostsManager(page) {
  await openComposer(page);
  await sleep(600);
  await clickInDialog(page, { exactAria: [LI_UI.toolbar.schedule, 'Schedule post'] }, 'schedule clock');
  const tabAt = () => evaluate(page, `(() => { ${DIALOG_SCOPE} const a = scopedAll('a').find((el) => _vis(el) && /^Scheduled( \\(\\d+\\))?$/.test(String(el.innerText || '').trim())); if (!a) return null; const r = a.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await waitFor(page, `(() => { ${DIALOG_SCOPE} return scopedAll('a').some((el) => _vis(el) && /^Scheduled( \\(\\d+\\))?$/.test(String(el.innerText || '').trim())); })()`, 10000, 'schedule dialog Scheduled tab');
  const tab = await tabAt();
  if (!tab) throw new Error('Could not find the Scheduled tab');
  await mouseClick(page, tab.x, tab.y);
  // wait for rows to render, or for an explicit empty list, so a row lookup never races the render
  await waitFor(page, `(() => { ${DIALOG_SCOPE} const t = String(activeDialog.innerText || '').replace(/\\s+/g, ' '); return /Posting [A-Z][a-z]{2}, /.test(t) || /Scheduled \\(0\\)/.test(t); })()`, 15000, 'Scheduled tab rows');
  await sleep(600);
}

/**
 * Scroll the Scheduled tab's lazy-loaded list down one step: scrollTop on the scroller plus a real
 * wheel event, then click a "Show more" control if the list ends in one. Callers loop until every
 * row is rendered (rows >= LinkedIn's own "Scheduled (N)") or the list has stopped growing for a while.
 */
async function scrollScheduledList(page) {
  const c = await evaluate(page, `(() => { ${DIALOG_SCOPE} const els = deepElements(activeDialog).filter((e) => e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)); const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || activeDialog; el.scrollTop = el.scrollHeight; const r = activeDialog.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await page('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: 1800 });
  const more = await evaluate(page, `(() => { ${DIALOG_SCOPE} const b = scopedAll('button,a,[role="button"]').find((e) => _vis(e) && /^(show|load|see) more/i.test(String(e.innerText || e.getAttribute('aria-label') || '').trim())); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (more) await mouseClick(page, more.x, more.y);
}

/**
 * Read the whole Scheduled tab: scrolls the (lazy-loaded) list until every row is rendered, then
 * returns { count, entries: [{ when, cap }] } where count is LinkedIn's own "Scheduled (N)" label.
 * Opens the tab itself unless opts.open === false.
 */
export async function readScheduledList(page, opts = {}) {
  if (opts.open !== false) await openScheduledPostsManager(page);
  const snap = () => evaluate(page, `(() => { ${DIALOG_SCOPE} const t = String(activeDialog.innerText || '').replace(/\\s+/g, ' '); const m = t.match(/Scheduled \\((\\d+)\\)/); const r = activeDialog.getBoundingClientRect(); return { count: m ? Number(m[1]) : null, rows: (t.match(/Posting [A-Z][a-z]{2}, /g) || []).length, text: t, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) }; })()`);
  let cur = await snap(); let last = -1; let stable = 0;
  for (let i = 0; i < 90 && stable < 8; i += 1) {
    if (cur.count !== null && cur.rows >= cur.count) break;
    await scrollScheduledList(page);
    await sleep(1500); cur = await snap();
    if (cur.rows === last) stable += 1; else { stable = 0; last = cur.rows; }
  }
  const when = '[A-Z][a-z]{2}, [A-Z][a-z]{2} \\d{1,2}, \\d{4} at \\d{1,2}:\\d{2} [AP]M';
  const entries = [...cur.text.matchAll(new RegExp(`Posting (${when})\\s+(?:Feed post\\s+)?(.*?)(?= Posting ${when}|$)`, 'g'))].map((x) => ({ when: x[1], cap: x[2].trim() }));
  return { count: cur.count, entries };
}

/**
 * Delete exactly the scheduled post at slotLocal from LinkedIn. Finds the row by its "Posting <date>
 * at <time>" link, refuses unless exactly one row matches, opens that row's "More options" menu and
 * clicks ONLY the exact "Delete post" item (the same menu also holds "Post now", which would publish
 * the post immediately, so there is no loose text fallback), confirms the delete dialog, then re-reads
 * the Scheduled tab and throws unless the count dropped by one and the row is gone.
 * ctx = { client, sessionId } lets the final re-read start from a fresh feed page.
 */
export async function deleteScheduledPost(page, slotLocal, ctx = {}) {
  const label = scheduledRowLabel(slotLocal);
  await openScheduledPostsManager(page);
  // Find the row by its header text ("Posting <date> at <time>"). Row markup differs by state: loaded rows are a
  // link wrapping the row with a labelled "More options" button; rows added by the lazy load are plain text until
  // they scroll out of view and back, so the lookup keys on the header text and the overflow icon, never on a link.
  const headerRe = `^Posting ${escapeRe(label)}$`;
  const locate = (scrollTo) => evaluate(page, `(() => { ${DIALOG_SCOPE}
    const re = new RegExp(${JSON.stringify(headerRe)});
    const hits = deepElements(activeDialog).filter((e) => e.children.length === 0 && re.test(String(e.innerText || '').trim()));
    const t = String(activeDialog.innerText || '').replace(/\\s+/g, ' '); const m = t.match(/Scheduled \\((\\d+)\\)/);
    const out = { n: hits.length, count: m ? Number(m[1]) : null, rows: (t.match(/Posting [A-Z][a-z]{2}, /g) || []).length };
    if (hits.length !== 1) return out;
    let row = hits[0]; for (let i = 0; i < 14 && row; i += 1, row = row.parentElement) { if (row.querySelector('svg[id^="overflow"]')) break; }
    const ovf = row && row.querySelector('svg[id^="overflow"]'); if (!ovf) return { ...out, err: 'no overflow icon in the row' };
    if (${scrollTo ? 'true' : 'false'}) ovf.scrollIntoView({ block: 'center' });
    const r = ovf.getBoundingClientRect();
    return { ...out, hydrated: Boolean(ovf.closest('[role="button"],button')), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  // the list is lazy-loaded: scroll until the target row renders, the list is fully loaded, or it stops growing
  let hit = await locate(false); let lastRows = -1; let stable = 0;
  for (let i = 0; i < 90 && hit.n === 0 && stable < 8; i += 1) {
    if (hit.count !== null && hit.rows >= hit.count) break;
    await scrollScheduledList(page);
    await sleep(1500); hit = await locate(false);
    if (hit.rows === lastRows) stable += 1; else { stable = 0; lastRows = hit.rows; }
  }
  if (hit.n !== 1) throw new Error(`Refusing to delete: expected exactly 1 scheduled post at "${label}", found ${hit.n}`);
  if (hit.err) throw new Error(`Could not locate the row menu for "${label}": ${hit.err}`);
  // rows the lazy load just added are inert until they scroll out of view and back: nudge to the top, return to the row, re-check
  hit = await locate(true);
  for (let i = 0; i < 6 && !hit.hydrated; i += 1) {
    await evaluate(page, `(() => { ${DIALOG_SCOPE} const els = deepElements(activeDialog).filter((e) => e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)); const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || activeDialog; el.scrollTop = 0; return true; })()`);
    await sleep(1500); hit = await locate(true); await sleep(1500); hit = await locate(true);
  }
  if (!hit.hydrated) throw new Error(`The row for "${label}" never became interactive; nothing was deleted`);
  const before = hit.count;
  await sleep(300); await mouseClick(page, hit.x, hit.y);
  const itemAt = (names) => evaluate(page, `(() => { const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }; const want = ${JSON.stringify(names)}; const el = [...document.querySelectorAll('[role="menuitem"]')].filter(vis).find((e) => want.includes(String(e.innerText || '').trim().toLowerCase())); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await waitFor(page, `(() => [...document.querySelectorAll('[role="menuitem"]')].some((e) => ['delete post', 'usuń post'].includes(String(e.innerText || '').trim().toLowerCase()) && e.getBoundingClientRect().width > 0))()`, 6000, 'row menu with Delete post');
  const del = await itemAt(['delete post', 'usuń post']);
  if (!del) { await clearTransientUi(page); throw new Error('Delete post menu item not found'); }
  await mouseClick(page, del.x, del.y);
  // the confirm is a small dialog ("Delete this post? ... cannot be undone", Cancel / Delete Post): any visible dialog that mentions delete and carries an exact Delete / Delete Post button
  const confirmAt = () => evaluate(page, `(() => { const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    for (const d of [...document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog, .artdeco-modal')].filter(vis).reverse()) {
      if (!/delete/i.test(d.innerText || '')) continue;
      const b = [...d.querySelectorAll('button')].filter(vis).find((x) => ['delete post', 'delete', 'usuń post', 'usuń'].includes(String(x.innerText || '').trim().toLowerCase()));
      if (b) { const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }
    } return null; })()`);
  await waitFor(page, `(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; return [...document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog, .artdeco-modal')].filter(vis).some((d) => /delete/i.test(d.innerText || '') && [...d.querySelectorAll('button')].some((x) => ['delete post', 'delete', 'usuń post', 'usuń'].includes(String(x.innerText || '').trim().toLowerCase()))); })()`, 8000, 'delete confirm dialog').catch(async () => { await clearTransientUi(page); throw new Error(`Delete confirm not shown for "${label}"; nothing was deleted`); });
  const ok = await confirmAt();
  if (!ok) { await clearTransientUi(page); throw new Error('Could not find the confirm Delete button; nothing was deleted'); }
  await mouseClick(page, ok.x, ok.y);
  await sleep(3000);
  // prove it from LinkedIn's side: fresh feed, re-read the tab, count must have dropped and the row be gone
  await clearTransientUi(page);
  if (ctx.client && ctx.sessionId) { await navigate(page, ctx.client, ctx.sessionId, 'https://www.linkedin.com/feed/'); await sleep(1500); }
  const after = await readScheduledList(page);
  const stillThere = after.entries.some((e) => e.when === label);
  if (stillThere || (before !== null && after.count !== before - 1)) throw new Error(`Delete not confirmed by LinkedIn: count ${before} -> ${after.count}, row present: ${stillThere}`);
  await clearTransientUi(page);
  return `deleted scheduled post @ ${slotLocal} (Scheduled ${before} -> ${after.count})`;
}

export async function runWithChrome(opts, fn) {
  const chrome = await launchChrome(opts);
  let client = null;
  try {
    client = new CdpClient(chrome.wsUrl);
    const { page, sessionId } = await createLinkedInPage(client);
    await navigate(page, client, sessionId, 'https://www.linkedin.com/feed/');
    return await fn({ page, sessionId, client });
  } finally { await closeChrome(chrome, client, opts.keepOpen); }
}
