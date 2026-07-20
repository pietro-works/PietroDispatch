---
name: dispatch
description: Run the daily Pietro Dispatch pipeline. Use when asked to produce the AI-news DISPATCH cards for a given day. Searches AI sources, curates three topics, writes two variations each in the Pietro.works DISPATCH voice, generates backgrounds with GPT Image 2, renders 2160 cards through news.html, and uploads a dated folder to Google Drive.
---

# Dispatch

You are running one cycle of Pietro Dispatch. Read `MASTERPLAN.md` once if you have not. Voice is governed by `prompts/PIETRO_WORKS_VOICE.MD` and `prompts/HUMANIZE.md`. Curation by `prompts/curation.md`. The artifact spec and the template field mapping by `prompts/generation.md`. Follow those files; this one is the sequence and the data contracts.

Set `DATE` to today in `YYYY-MM-DD`. All staging lives under `work/<DATE>/`.

## Step 1 — Curate

Search the sources in `sources.yaml` and the open web for the day's AI news. Fetch the full text of the strongest candidates so the writing is grounded, never guessed. Pick three topics per `prompts/curation.md`. Each topic carries a slug, a one-line angle, a category from the allowed set (BREAKING, ANALYSIS, INDUSTRY, INSIGHT, REPORT, OPINION), and the source URLs.

## Step 2 — Write

For each topic, write two variations per `prompts/generation.md`. A variation is: category, the full headline, the exact accent substring (it must appear verbatim in the headline), the summary, the post body, and the image prompt. Apply the DISPATCH four-marker form and the text-disposition targets. Vary the two takes; do not reword one into the other.

## Step 3 — Stage

Assign each variation an id `<NN>-<v>`, NN the topic 01 to 03, v the variant 1 or 2. Write under `work/<DATE>/`:

- `prompts.json` — array of `{ "id": "01-1", "image_prompt": "..." }`, six entries.
- `cards.json` — array of `{ "id": "01-1", "category": "INSIGHT", "headline": "...", "highlight": "...", "summary": "...", "bg": "backgrounds/bg-01-1.png" }`, six entries. A card may also carry an optional `headlineSize` (integer px) that caps the headline font size and overrides the renderer's auto-fit. The renderer already holds every headline to at most two lines on its own (three lines is not allowed), so this is rarely needed; reach for it only to pin a particular two-line break you want. Omit it for normal auto-sizing.
- `captions/caption-<id>.txt` — the post body plus the hashtag line, paste-ready, one file per variation.
- `meta/<NN>.json` — per topic: slug, angle, source urls, and the two variations' headline, highlight, summary, and image prompt.

## Step 4 — Images

Run `node pipeline/generate-images.mjs --in work/<DATE>/prompts.json --out work/<DATE>/backgrounds`. It writes `bg-<id>.png` at 1080 for each prompt. Requires `OPENAI_API_KEY` in the environment. The model is `gpt-image-2`, which needs OpenAI organization verification on the account, or the calls fail with a 401/403; that is an account state, not a prompt problem. If a generation is blocked or fails after retries, regenerate that one image prompt with a lightly rephrased prompt rather than failing the run.

Every background follows one fixed look rule: the brand's cool navy and cyan base plus a single contained warm accent on the opposite side of the color wheel. The rule lives in `prompts/generation.md`; the brand grade and palette it sits on are defined in `pietro.works/design/DESIGN.md`.

## Step 5 — Render

Run `node renderer/news.mjs --cards work/<DATE>/cards.json --root work/<DATE> --out work/<DATE>/cards --check-fit`. It renders each card to `post-<id>.png` at 2160 and validates the dimensions. `--check-fit` reads `measureFit()` per card and exits non-zero on any `[fit FAIL]` (headline, summary, or a stray word alone on a line), the same gate slides and article render under. On macOS with Google Chrome installed it runs locally with no setup; the script resolves the binary from `CHROME_BIN` or the usual locations. Only if no Chromium will launch does the render fork from the master plan apply: upload the backgrounds and `cards.json` to the day's Drive folder and hand off to the local render trigger instead of finishing here.

## Step 6 — Assemble and upload

Before assembling, render a 2-by-3 contact sheet of the six cards and eyeball it: each headline sits on one or two lines with no orphan (never three) and breaks balanced with the accent inside those two lines, each summary is exactly two lines with a nearly-full second line, the accent phrase reads, the summary stays legible over the background, and the warm accent landed. The renderer prints the fit measurement per card (`h=<lines>L@<size>px s=<lines>L/<fill>%`) and flags `[fit FAIL]`; treat any flag as a blocker, and run with `--check-fit` to make the render exit non-zero on a violation. Fix a card before it ships, not after.

Build the Drive folder `pietro-works-env/queue/Pietro Dispatch/<DATE>/`. For each topic create `candidate-<NN>-<slug>/` and place its two backgrounds as `bg-1.png` and `bg-2.png`, its two cards as `post-1.png` and `post-2.png`, its two captions as `caption-1.txt` and `caption-2.txt`, and a `meta.json` from `meta/<NN>.json`. Write `_index.md` at the date root listing the three topics, the angle for each, and the source links.

How you write it depends on where you run. When Drive for Desktop is mounted (a local manual run), assemble the folder directly on the mount at `<My Drive>/pietro-works-env/queue/Pietro Dispatch/<DATE>/` and let it sync. That avoids pushing multi-megabyte PNGs through the Google Drive connector, which is slow and floods the context with base64. In the cloud routine, where there is no mount, use the connector. Either way, strip any `.DS_Store` macOS drops into the folder before you call it done.

Once each candidate is delivered, archive it into the flat archive: `node pipeline/archive-to-dispatch-posts.mjs "<My Drive>/pietro-works-env/queue/Pietro Dispatch/<DATE>/candidate-<NN>-<slug>"`, once per candidate. It copies (never moves) into `pietro-works-env/dispatch-posts/` as the next `news-NNN`, so the queue folder stays intact for Studio.

Before the first upload of a session that writes to Drive, confirm with Pietro. After that, proceed.

## Files and the archive (three homes, one job each)

- **`work/<DATE>/` in this repo is staging only.** It organizes background generation and rendering: `prompts.json`, `cards.json`, `backgrounds/`, `cards/`, `captions/`, `meta/`. It is scratch. Nothing here is the finished asset.
- **`pietro-works-env/queue/Pietro Dispatch/<DATE>/` is the structured delivery.** Studio scans, schedules, and posts from here. It must match the contract (Step 6).
- **`pietro-works-env/dispatch-posts/` is the flat unified archive, the final store.** `archive-to-dispatch-posts.mjs` copies each delivered candidate here as `news-NNN.png` (+ `-b` for variation 2), `bg-news-NNN.png` (+ `-b`), and `caption-news-NNN.txt` (+ `-b`). This is what Pietro browses and references by number ("news-012", "slides-004").

**Re-rendering or fixing an asset that is already archived.** The archive script only ever assigns the NEXT free `NNN`, so re-running it makes a duplicate, not an update. To update an existing asset (a look change, a copy fix, a re-render), do not re-run the script: find its existing `NNN` (match the caption text or the cover image), then overwrite the same `dispatch-posts/news-NNN.*` files directly with the new render. Always update BOTH places, the `queue/` folder Studio posts from AND the matching `dispatch-posts/NNN` entry, or the two silently drift.

## Notes

- Never put a credential in any file or log.
- The accent substring is matched against the headline by a literal string replace in the template, so it must be an exact substring.
- Caption files contain the post body only, not the headline; the headline lives on the card.
- When re-running the images for a date that already produced cards (a look change or a reroll), archive the current `bg-*` and `post-*` as `*_old.png` first, in both `work/<DATE>/` and the Drive folder, then regenerate. Nothing gets overwritten without a copy.
- Keep everything you write free of em dashes.

## Enterprise

This module (`news`) runs under Pietro Enterprise (sibling repo `pietro-enterprise`). Two things are non-optional there:

- **Contract.** Deliver as `pietro-works-env/queue/Pietro Dispatch/<DATE>/candidate-<NN>-<slug>/` with `post-1/2.png`, `caption-1/2.txt`, `meta.json`. Studio's scanner silently skips anything else. Prove it: `node ../pietro-enterprise/registry/contracts/validate-contract.mjs "<folder>"`.
- **Two gates.** Before delivery, the output passes Brand Guardian (voice, brand, grounding) then Validator (contract, dimensions, will Studio index it). See `pietro-enterprise/skills/review`.
