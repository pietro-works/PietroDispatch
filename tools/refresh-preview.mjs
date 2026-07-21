#!/usr/bin/env node
/**
 * refresh-preview.mjs — rebuild the dashboard data and sync the served copy to /tmp
 * (the preview server runs sandboxed and cannot read the Google Drive mount, so the
 * dashboard.html + db/dashboard.json + thumbs are served from /tmp/pietro-studio-preview).
 * Run after scheduling or whenever assets change, then reload the preview.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const TOOLS = dirname(fileURLToPath(import.meta.url));
const STUDIO = resolve(TOOLS, '..');
const TMP = '/tmp/pietro-studio-preview';

await run('node', [join(TOOLS, 'scan-assets.mjs')]);
await run('node', [join(TOOLS, 'dashboard-data.mjs')]);
await mkdir(join(TMP, 'db', 'thumbs'), { recursive: true });
await copyFile(join(STUDIO, 'dashboard.html'), join(TMP, 'dashboard.html'));
await copyFile(join(STUDIO, 'db', 'dashboard.json'), join(TMP, 'db', 'dashboard.json'));
await rm(join(TMP, 'db', 'thumbs'), { recursive: true, force: true });
await mkdir(join(TMP, 'db', 'thumbs'), { recursive: true });
for (const f of await readdir(join(STUDIO, 'db', 'thumbs'))) await copyFile(join(STUDIO, 'db', 'thumbs', f), join(TMP, 'db', 'thumbs', f));
console.log('preview refreshed at ' + TMP);
