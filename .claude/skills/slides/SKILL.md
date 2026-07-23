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
Set `DATE` to today in `YYYY-MM-DD`. All staging lives under `work/slides-<DATE>-<slug>/`, where
`<slug>` is the concept slug from Step 1. The slug is not decoration: staging keyed on the date
alone lets a second deck on the same day overwrite the first deck's backgrounds in a shared
folder. Two decks in one day is exactly how deck 007's raw art was lost. Slug-scope the folder
and that can never happen.

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

Under `work/slides-<DATE>-<slug>/` write:

- `slides.json` — the `deck` object: `{ topic, slides:[...] }`.
- `prompts.json` — the `prompts` array `[{ id, image_prompt }]` (C contributes `<id>a` and `<id>b`).
- `caption.txt` — the post body plus the hashtag line, paste-ready.
- `meta.json` — concept slug, angle, why_evergreen, references, and the deck's slide list.

## Step 4 — Images

Run `node pipeline/generate-images.mjs --in work/slides-<DATE>-<slug>/prompts.json --out work/slides-<DATE>-<slug>/backgrounds`. Writes `bg-<id>.png` at 1080 for each prompt. Requires `OPENAI_API_KEY` (in `~/.zshenv` so non-interactive scheduled shells see it). Same `gpt-image-2` model and warm-accent look as dispatch. If one image is blocked, rephrase that prompt and retry.

## Step 5 — Render and stitch

Run `node renderer/slides.mjs --deck work/slides-<DATE>-<slug>/slides.json --root work/slides-<DATE>-<slug> --out work/slides-<DATE>-<slug>/slides --pdf work/slides-<DATE>-<slug>/slides.pdf --check-fit`. It renders each card to `post-<id>.png` at 2160 (validated), then stitches a square 1080-per-page PDF (`slides.pdf`) via the same headless Chrome. Runs locally against installed Google Chrome.

`--check-fit` turns the disposition rule into a measured gate: after each card it reads `measureSlideFit()` from the template and prints `[fit ok|FAIL] hl=<n>L t=<n>L`, where `hl` is the visual lines the gradient accent crosses and `t` is the tallest title/hero. It writes every PNG and the PDF first, so a fail never aborts the batch, then exits non-zero if any card broke the rule. Read the fit lines in Step 6.

## Step 6 — QA and upload

Eyeball the deck: every headline breaks clean, accents read, the C "before" is visibly
desaturated against the "after", glyphs and steps align to the shared baseline, the Contact
card closes it. Open `slides.pdf` and confirm it flows as a carousel.

Two line rules that catch what gets hand-corrected most (see the slides bullet in
`pietro-enterprise/skills/review` Disposition). The first is now renderer-measured, not eyeballed:
`--check-fit` (Step 5) fails any card whose gradient accent spans more than two visual lines or
whose title/hero breaks past two. Every card must print `[fit ok]`; treat any `[fit FAIL]` as a
hard blocker. The `hl=<n>L` on the fit line is the accent's line count, `t=<n>L` the tallest
title/hero. Fix a fail by redistributing the copy in `slides.json` or re-picking a shorter
contiguous accent, then re-render until the run exits clean.

The second rule is the balanced break, and its hard edge is now renderer-measured too: `--check-fit`
flags `stray word on <block>` when any wrapped block strands a lone word on a line, checking every
`hero`, `title`, both C-card lines (`before` and `after`), and each A-card step (identical detection
to news and article). What still stays your eye is the finer evenness: roughly equal line lengths,
no split mid-phrase. Heroes and titles use
hardcoded `<br>`; the C `before`/`after` honor a literal `\n`, so pin the break there (write
`"You tune by eye\nand hope."`, not the auto-wrap that strands `hope.`). A-card steps auto-wrap,
so shorten any step that wraps to a lone trailing word. For a type C, pick an accent that also
lands inside the wrapped line without a stranded leading word. When an accent closes its line,
keep its trailing period inside the `hl` so the gradient carries the period; a plain white `.`
hanging off the accent is the tell it was left out. Fix it before upload, not after.

Build the Drive folder `pietro-works-env/queue/Pietro Slides/<DATE>-<slug>/`: the `post-*.png` slides, `slides.pdf`
(the LinkedIn document to upload), `caption.txt`, `meta.json`, and the raw `bg-*.png` from
`work/slides-<DATE>-<slug>/backgrounds/` (copy them flat into the folder). The backgrounds are
required by the contract: they are the only re-render source and exist nowhere else. When Drive for Desktop is
mounted, assemble directly on the mount at `<My Drive>/pietro-works-env/queue/Pietro Slides/` and let it sync; do not
push PNGs through the connector. Strip any `.DS_Store` before finishing.

Once delivered, archive the deck into the flat archive: `node pipeline/archive-to-dispatch-posts.mjs "<My Drive>/pietro-works-env/queue/Pietro Slides/<DATE>-<slug>"`. It copies (never moves) into `pietro-works-env/dispatch-posts/` as the next `slides-NNN`, so the queue folder stays intact for Studio.

Before the first upload of a session that writes to Drive, confirm with Pietro. After that, proceed.

## Files and the archive (three homes, one job each)

- **`work/slides-<DATE>-<slug>/` in this repo is staging only.** It organizes background generation and rendering: `slides.json`, `prompts.json`, `backgrounds/`, `slides/` (the rendered `post-*.png`), `slides.pdf`, `caption.txt`, `meta.json`. Scratch. Nothing here is the finished deck.
- **`pietro-works-env/queue/Pietro Slides/<DATE>-<slug>/` is the structured delivery.** Studio scans, schedules, and posts the PDF from here. It must match the contract (Step 6).
- **`pietro-works-env/dispatch-posts/` is the flat unified archive, the final store.** `archive-to-dispatch-posts.mjs` copies the deck here as `slides-NNN.pdf`, `slides-NNN.png` (the cover, `post-01`), `caption-slides-NNN.txt`, and the raw `bg-slides-NNN-<id>.png`. This is what Pietro browses and references by number ("slides-004"). The individual pages live only inside the PDF, but the raw backgrounds are now archived so the deck is always re-renderable.

**Re-rendering or fixing a deck that is already archived.** The archive is now idempotent: on first archive it stamps the assigned `NNN` into the delivery `meta.json` (`"number"`), and re-running the script on the same folder reuses that number and overwrites `dispatch-posts/slides-NNN.*` in place instead of minting a duplicate. So the safe update path is: fix the deck in its `queue/` folder, then re-run `archive-to-dispatch-posts.mjs` on it. Both homes stay in sync because the number is pinned in meta.

## Notes

- Never put a credential in any file or log.
- `hl` accents are matched by literal substring in the template; exact substring only.
- The caption is the post text; the slides carry the teaching, the PDF is the carousel.
- A slide deck must be evergreen. If it leans on a dated release, it belongs in dispatch.
- LinkedIn document best practice: square pages, keep the deck tight (3 to 5 slides), PDF.
- Re-running images is safe: `generate-images.mjs` preserves any existing `bg-<id>.png` as `bg-<id>.old-<stamp>.png` before rewrite (pass `--force` to overwrite in place). You no longer hand-copy `*_old` first.
- Keep everything you write free of em dashes.

## Enterprise

This module (`slides`) runs under Pietro Enterprise (sibling repo `pietro-enterprise`). Deliver as `pietro-works-env/queue/Pietro Slides/<DATE>-<slug>/` with `slides.pdf`, `post-01.png`, `caption.txt`, `meta.json`, or Studio's scanner skips it. Prove it with `node ../pietro-enterprise/registry/contracts/validate-contract.mjs "<folder>"`, and pass the two gates in `pietro-enterprise/skills/review` before delivery.
