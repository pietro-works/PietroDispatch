---
name: slides
description: Run one Pietro.works slides cycle. Use when asked to produce an evergreen LinkedIn slide carousel (concept-explainer). Scans the field for a durable concept, designs a short A/B/C + Contact deck in the Pietro.works voice, generates a contextual GPT Image 2 background per card, renders 2160 slides through slides.html, stitches a square PDF, and uploads to Google Drive. Reuses the dispatch image pipeline; render and stitch are slides.mjs.
---

# Slides

You are running one cycle of Pietro.works slides: an evergreen concept taught as a short
LinkedIn document carousel. Read `MASTERPLAN.md` once for the system. Voice is governed by
`prompts/PIETRO_WORKS_VOICE.MD` and `prompts/HUMANIZE.md`. Concept selection by
`prompts/slides-curation.md` and `prompts/slides-sources.yaml`. The deck spec and template
mapping by `prompts/slides-generation.md`. This file is the sequence and the data contracts.

Slides are evergreen, not news. Cadence is Tuesday and Thursday (dispatch runs odd days).
Set `DATE` to today in `YYYY-MM-DD`. All staging lives under `work/slides-<DATE>/`.

## Step 1 — Scan and curate

Run the evergreen-concept scan in `prompts/slides-curation.md` against
`prompts/slides-sources.yaml` and the open web (domain, practitioner signal, engagement
study). Pick ONE durable concept Pietro can teach from his own work, still true in a year.
Output the concept JSON (slug, title, angle, why_evergreen, category, references). The
top-right `topic_label` is the fixed series name `IN_THE_LOOP.MD` on every deck, never derived.
If nothing clears the evergreen-and-authoritative bar, widen the scan once; do not ship a
weak or dated concept.

## Step 2 — Design the deck

Per `prompts/slides-generation.md`, design a 3 to 5 slide deck: choose card types by best fit
(A steps, B hero, C before/after) and always close with a Contact slide. Write each slide's
fields to the renderer contract, the contextual glyphs for any B card, an image prompt per
card (two for any C card), and the post caption. The output has three keys: `deck`, `prompts`,
`caption`.

## Step 3 — Stage

Under `work/slides-<DATE>/` write:

- `slides.json` — the `deck` object: `{ topic, slides:[...] }`.
- `prompts.json` — the `prompts` array `[{ id, image_prompt }]` (C contributes `<id>a` and `<id>b`).
- `caption.txt` — the post body plus the hashtag line, paste-ready.
- `meta.json` — concept slug, angle, why_evergreen, references, and the deck's slide list.

## Step 4 — Images

Run `node pipeline/generate-images.mjs --in work/slides-<DATE>/prompts.json --out work/slides-<DATE>/backgrounds`. Writes `bg-<id>.png` at 1080 for each prompt. Requires `OPENAI_API_KEY` (in `~/.zshenv` so non-interactive scheduled shells see it). Same `gpt-image-2` model and warm-accent look as dispatch. If one image is blocked, rephrase that prompt and retry.

## Step 5 — Render and stitch

Run `node renderer/slides.mjs --deck work/slides-<DATE>/slides.json --root work/slides-<DATE> --out work/slides-<DATE>/slides --pdf work/slides-<DATE>/slides.pdf`. It renders each card to `post-<id>.png` at 2160 (validated), then stitches a square 1080-per-page PDF (`slides.pdf`) via the same headless Chrome. Runs locally against installed Google Chrome.

## Step 6 — QA and upload

Eyeball the deck: every headline breaks clean, accents read, the C "before" is visibly
desaturated against the "after", glyphs and steps align to the shared baseline, the Contact
card closes it. Open `slides.pdf` and confirm it flows as a carousel.

Build the Drive folder `Pietro Slides/<DATE>-<slug>/`: the `post-*.png` slides, `slides.pdf`
(the LinkedIn document to upload), `caption.txt`, and `meta.json`. When Drive for Desktop is
mounted, assemble directly on the mount at `<My Drive>/Pietro Slides/` and let it sync; do not
push PNGs through the connector. Strip any `.DS_Store` before finishing.

Before the first upload of a session that writes to Drive, confirm with Pietro. After that, proceed.

## Notes

- Never put a credential in any file or log.
- `hl` accents are matched by literal substring in the template; exact substring only.
- The caption is the post text; the slides carry the teaching, the PDF is the carousel.
- A slide deck must be evergreen. If it leans on a dated release, it belongs in dispatch.
- LinkedIn document best practice: square pages, keep the deck tight (3 to 5 slides), PDF.
- On a re-run for the same date and slug, archive existing `post-*`/`slides.pdf` as `*_old` first.
- Keep everything you write free of em dashes.

## Enterprise

This module (`slides`) runs under Pietro Enterprise (sibling repo `pietro-enterprise`). Deliver as `Pietro Slides/<DATE>-<slug>/` with `slides.pdf`, `post-01.png`, `caption.txt`, `meta.json`, or Studio's scanner skips it. Prove it with `node ../pietro-enterprise/registry/contracts/validate-contract.mjs "<folder>"`, and pass the two gates in `pietro-enterprise/skills/review` before delivery.
