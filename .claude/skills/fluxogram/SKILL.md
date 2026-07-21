---
name: fluxogram
description: Make one Pietro.works fluxogram: an evergreen concept taught as a wide six-card horizontal flow diagram, a single PNG. Use when Pietro asks for a fluxogram, a flow diagram, a pipeline graphic, or a concept drawn as a six-step flow. Scans for a durable concept, designs a flow spec, picks a background from the shared library, renders through fluxogram.html, writes the caption, and delivers to the Pietro Fluxograms queue.
---

# Fluxogram

You are producing one Pietro.works fluxogram: a durable idea laid out as a wide six-card horizontal flow. Read `MASTERPLAN.md` once for the system. Voice is governed by `prompts/PIETRO_WORKS_VOICE.MD` and `prompts/HUMANIZE.md`. The concept bar is the evergreen scan in `prompts/slides-curation.md` (shared with slides). The spec design and the caption format are `prompts/fluxogram-generation.md`. This file is the sequence and the data contracts.

Fluxograms are evergreen, not news, and a single wide PNG, not a carousel or a PDF. The track runs on a schedule: two fluxograms every Thursday at 13:00, the same hour as slides, each a fresh durable idea. It can also be run on demand. Set `DATE` to today in `YYYY-MM-DD`, derive a short kebab `slug` from the concept, and stage under `work/fluxogram-<DATE>-<slug>/`.

## Step 1: Scan and pick

Run the evergreen-concept bar in `prompts/slides-curation.md` against the open web and Pietro's own practice. Pick ONE durable idea that reads as an ordered method: six steps Pietro can teach, with a single pivot the whole thing turns on, still true in a year. Not a dated release, and not a five- or seven-step idea forced into six. If nothing clears the bar, widen once; do not ship a weak flow. Output the concept: slug, title, the six-step arc on one line, and which step is the pivot.

## Step 2: Design the spec and caption

Per `prompts/fluxogram-generation.md`, design the spec: `kick`, `flow` (three beats, the middle one in `<b>`), six `cards` each with `num`, `glyph` (a name from the `G` library in `renderer/fluxogram.html`), a one-word `name`, and two short `nowrap` mono lines, with exactly one card `hero: true` carrying a `tag`, plus `footL` and `footR` (the payoff number in `footR`'s `<b>`). Keep every mono line short enough that it never wraps; there is no fit gate to catch it. Write the caption in the fluxogram format: a 💠 opener line, one short insight paragraph, then `#PietroWorks #OpenToDisruption`. The output has two keys: `spec` and `caption`.

## Step 3: Stage

Pick a background from `pietro-works-env/queue/Pietro Dispatch/2026-06-30/bg-db/` (`bg-01.png` to `bg-20.png`, cold steel with one warm glow) that no recent fluxogram used, set the spec's `bg` to its absolute path, and tune `bgPos` and `bgOpacity` per the generation doc. Under `work/fluxogram-<DATE>-<slug>/` write:

- `spec.json`: the `spec` object, the full fluxo spec the renderer consumes.
- `caption.txt`: the caption, paste-ready.
- `meta.json`: `{ slug, title, angle, why_evergreen, pivot, bg, sources }`, the concept metadata.

## Step 4: Render

Run `node renderer/fluxogram.mjs --data work/fluxogram-<DATE>-<slug>/spec.json --out work/fluxogram-<DATE>-<slug>/fluxogram.png --format png --width 2400`. It injects the spec, inlines `bg` as a data URL, and writes the diagram at exactly 2400x822. It prints `wrote <path> (2400x822 png)`; confirm the size. Runs locally against installed Google Chrome, the same CDP path as the other renderers.

There is no `--check-fit` for fluxograms. The layout is placed as written, so QA is by eye (Step 5), and the length discipline in `spec.json` is what keeps lines from clipping.

## Step 5: QA and deliver

Open `fluxogram.png` and read it once, edge to edge: every card `name` sits on one line, no mono line is cut at a card edge (the `nowrap` tell, a phrase running under the border), the six glyphs match their steps, the hero card reads as the pivot and its `tag` chip fits, the `flow` beats and both foot values read, and the warm background accent sits behind the cards without fighting the copy. Fix any clip or wrong glyph in `spec.json` and re-render before delivery, not after.

Build the Drive folder `pietro-works-env/queue/Pietro Fluxograms/<DATE>-<slug>/`: `fluxogram.png` (2400x822), `spec.json`, `caption.txt`, `meta.json`. When Drive for Desktop is mounted, assemble directly on the mount at `<My Drive>/pietro-works-env/queue/Pietro Fluxograms/` and let it sync; do not push the PNG through the connector. Strip any `.DS_Store` before finishing.

Once delivered, archive into the flat archive: `node pipeline/archive-to-dispatch-posts.mjs "<My Drive>/pietro-works-env/queue/Pietro Fluxograms/<DATE>-<slug>" --type fluxo`. It copies (never moves) into `pietro-works-env/dispatch-posts/` as the next `pietro-fluxo-NNN`, so the queue folder stays intact for Studio.

Before the first upload of a session that writes to Drive, confirm with Pietro. After that, proceed.

## Files and the archive (three homes, one job each)

- **`work/fluxogram-<DATE>-<slug>/` in this repo is staging only.** It organizes the render: `spec.json`, `caption.txt`, `meta.json`, and the rendered `fluxogram.png`. Scratch. Nothing here is the finished asset.
- **`pietro-works-env/queue/Pietro Fluxograms/<DATE>-<slug>/` is the structured delivery.** Studio scans and posts the PNG from here. It must match the contract (Step 5).
- **`pietro-works-env/dispatch-posts/` is the flat unified archive, the final store.** `archive-to-dispatch-posts.mjs` copies the fluxogram here as `pietro-fluxo-NNN.png`, `pietro-fluxo-NNN.json` (the spec, so it stays re-renderable), and `caption-pietro-fluxo-NNN.txt`. This is what Pietro browses and sources by number.

**Re-rendering or fixing a fluxogram that is already archived.** The archive script only ever assigns the NEXT free `NNN`, so re-running it makes a duplicate, not an update. To update an existing fluxogram (an edited card, a new background), do not re-run the script: find its existing `NNN` (match the caption or the spec), then overwrite the same `dispatch-posts/pietro-fluxo-NNN.{png,json}` (and the caption if it changed) directly with the new render. Always update BOTH places, the `queue/` folder Studio posts from AND the matching `dispatch-posts/NNN` entry, or the two silently drift.

## Notes

- Never put a credential in any file or log.
- Six cards, one hero. The hero is the pivot the concept turns on, not decoration.
- Each mono line is `white-space:nowrap`; if it is too long it clips silently. Short lines are the whole discipline.
- A fluxogram must be evergreen. If it leans on a dated release, it belongs in dispatch.
- Single wide PNG, no PDF. Two per scheduled run (Thursday).
- The caption format (💠 opener, one insight paragraph, `#PietroWorks #OpenToDisruption`) lives in `prompts/fluxogram-generation.md`; do not restate it elsewhere.
- Keep everything you write free of em dashes.

## Enterprise

This module (`fluxogram`) runs under Pietro Enterprise (sibling repo `pietro-enterprise`). Deliver as `pietro-works-env/queue/Pietro Fluxograms/<DATE>-<slug>/` with `fluxogram.png` (2400x822), `spec.json`, `caption.txt`, `meta.json`, or Studio's scanner skips it. Prove it with `node ../pietro-enterprise/registry/contracts/validate-contract.mjs "<folder>"`, and pass the two gates in `pietro-enterprise/skills/review` before delivery. The caption's diamond opener is mandatory on a feed post; the Brand Guardian checks for it.
