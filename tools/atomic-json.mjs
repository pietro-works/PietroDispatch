/**
 * atomic-json.mjs — write JSON so a reader never sees a half-written file.
 * PACS0005 — shared DB state (plan.json, assets.json) is written tmp+rename, never in place,
 * so a concurrent Studio/scan/publish reader can't catch a truncated file — AGENTS.md
 */
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeJsonAtomic(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  await rename(tmp, path);
}
