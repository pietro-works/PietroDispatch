#!/usr/bin/env node
/**
 * generate-images.mjs — editorial backgrounds with GPT Image 2.
 *
 * Generates at 1088x1088 because GPT Image 2 rejects edges not divisible by 16,
 * and 1080 is not. Then crops 4px off every side to land on exactly 1080x1080.
 *
 * --format wide (article banners): generates at 1920x1088 (both divisible by 16)
 * and crops 4px top and bottom to land on exactly 1920x1080, 16:9.
 *
 * Usage:
 *   node pipeline/generate-images.mjs --in work/<date>/prompts.json --out work/<date>/backgrounds [--format square|wide]
 *
 * prompts.json: [{ id, image_prompt }]
 * Requires OPENAI_API_KEY. Requires OpenAI Organization Verification on the
 * account, or the GPT Image 2 calls fail with an access error.
 *
 * deps: npm i openai sharp
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';

const MODEL = 'gpt-image-2';
const QUALITY = 'medium';
const MAX_ATTEMPTS = 3;

// Each format generates at 16-divisible edges, then crops to the exact target.
const FORMATS = {
  square: { gen: '1088x1088', crop: { left: 4, top: 4, width: 1080, height: 1080 } }, // news cards
  wide:   { gen: '1920x1088', crop: { left: 0, top: 4, width: 1920, height: 1080 } }, // article banners, 16:9
};

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { in: null, out: null, format: 'square' };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--in') o.in = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--format') o.format = a[++i];
    else throw new Error(`Unknown argument: ${a[i]}`);
  }
  if (!o.in || !o.out) throw new Error('Required: --in, --out');
  if (!FORMATS[o.format]) throw new Error(`Unknown --format: ${o.format} (square|wide)`);
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOne(client, prompt, genSize) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await client.images.generate({ model: MODEL, prompt, size: genSize, quality: QUALITY, n: 1 });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error('no image data returned');
      return Buffer.from(b64, 'base64');
    } catch (e) {
      lastErr = e;
      // do not retry hard failures like auth or verification
      const status = e?.status || e?.response?.status;
      if (status === 401 || status === 403) throw e;
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`image generation failed after ${MAX_ATTEMPTS} attempts: ${lastErr?.message || lastErr}`);
}

async function main() {
  const opts = parseArgs();
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  const prompts = JSON.parse(await readFile(opts.in, 'utf8'));
  await mkdir(opts.out, { recursive: true });
  const client = new OpenAI();
  const fmt = FORMATS[opts.format];

  for (const { id, image_prompt } of prompts) {
    const raw = await generateOne(client, image_prompt, fmt.gen);
    const cropped = await sharp(raw)
      .extract(fmt.crop)
      .png()
      .toBuffer();
    const out = join(opts.out, `bg-${id}.png`);
    await writeFile(out, cropped);
    console.log(`wrote bg-${id}.png`);
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
