---
name: tutorial
description: Make one Pietro.works tutorial image: a how-to taught as one to eight captioned step images with connectors on a branded backdrop, a single 2160 PNG. Use when Pietro asks for a tutorial, how-to graphic, or step-by-step image.
---

# Tutorial

You are producing one Pietro.works tutorial image. Voice is governed by `prompts/PIETRO_WORKS_VOICE.MD` and `prompts/HUMANIZE.md`.

**Step 0 (always first): read `prompts/GENERATORS.md`** section 6 (and the format chooser). Design with the full lever set: rows, mask, size, connector types, per-cell zoom and pan.

Set `DATE` to today in `YYYY-MM-DD` and derive a short kebab `slug`. Staging lives under `work/tutorial-<DATE>-<slug>/` and never date-only (PACS0003).

## Step 1: Pick the how-to
One procedure a reader can do in 3 to 8 steps. Evergreen, concrete, one outcome. Each step is a short verb phrase.

## Step 2: Design the spec
Write `spec.json` per `renderer/tutorial.mjs` header and `prompts/GENERATORS.md` section 6: `top`, `bot`, `size`, `shape`, `radius`, `hsize`, `scrim`, `blur`, `bg`, `text`, `cells`, optional `hConn`, `vConn`, `tf`. Always set `top` and `bot` and a real `text.headline` with one accent span.

## Step 3: Images
One backdrop (`bg.png`, 1080 square PNG, raw, keep it) and one PNG per cell. User may supply the images; otherwise draw simple brand-styled diagrams or prompt per `prompts/generation.md`. Images must be PNG.

## Step 4: Render and inspect
`node renderer/tutorial.mjs --spec work/tutorial-<DATE>-<slug>/spec.json --root work/tutorial-<DATE>-<slug> --out work/tutorial-<DATE>-<slug>/tutorial.png`. Look at the result; check captions, connectors and that nothing is clipped.

## Step 5: Caption
Diamond opener, one tight paragraph, DM invite, hashtags per `prompts/PIETRO_WORKS_VOICE.MD`. No em dashes.

## Step 6: Deliver, validate, archive
Deliver `tutorial.png`, `caption.txt`, `meta.json` (`slug`, `title`, `sources[]`), `bg.png`, `spec.json` to `queue/Pietro Tutorials/<DATE>-<slug>/`. Run `node ../pietro-enterprise/registry/contracts/validate-contract.mjs <folder>`, then `node pipeline/archive-to-dispatch-posts.mjs <folder>` and `node tools/scan-assets.mjs`. Booking is separate (`tools/publish.mjs apply-plan`).
