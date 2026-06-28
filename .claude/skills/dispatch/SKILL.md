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
- `cards.json` — array of `{ "id": "01-1", "category": "INSIGHT", "headline": "...", "highlight": "...", "summary": "...", "bg": "backgrounds/bg-01-1.png" }`, six entries.
- `captions/caption-<id>.txt` — the post body plus the hashtag line, paste-ready, one file per variation.
- `meta/<NN>.json` — per topic: slug, angle, source urls, and the two variations' headline, highlight, summary, and image prompt.

## Step 4 — Images

Run `node pipeline/generate-images.mjs --in work/<DATE>/prompts.json --out work/<DATE>/backgrounds`. It writes `bg-<id>.png` at 1080 for each prompt. Requires `OPENAI_API_KEY` in the environment. The model is `gpt-image-2`, which needs OpenAI organization verification on the account, or the calls fail with a 401/403; that is an account state, not a prompt problem. If a generation is blocked or fails after retries, regenerate that one image prompt with a lightly rephrased prompt rather than failing the run.

Every background follows one fixed look rule: the brand's cool navy and cyan base plus a single contained warm accent on the opposite side of the color wheel. The rule lives in `prompts/generation.md`; the brand grade and palette it sits on are defined in `pietro.works/design/DESIGN.md`.

## Step 5 — Render

Run `node renderer/news.mjs --cards work/<DATE>/cards.json --root work/<DATE> --out work/<DATE>/cards`. It renders each card to `post-<id>.png` at 2160 and validates the dimensions. On macOS with Google Chrome installed it runs locally with no setup; the script resolves the binary from `CHROME_BIN` or the usual locations. Only if no Chromium will launch does the render fork from the master plan apply: upload the backgrounds and `cards.json` to the day's Drive folder and hand off to the local render trigger instead of finishing here.

## Step 6 — Assemble and upload

Before assembling, render a 2-by-3 contact sheet of the six cards and eyeball it: each headline breaks cleanly with no orphan, the accent phrase reads, the summary stays legible over the background, and the warm accent landed. Fix a card before it ships, not after.

Build the Drive folder `Pietro Dispatch/<DATE>/`. For each topic create `candidate-<NN>-<slug>/` and place its two backgrounds as `bg-1.png` and `bg-2.png`, its two cards as `post-1.png` and `post-2.png`, its two captions as `caption-1.txt` and `caption-2.txt`, and a `meta.json` from `meta/<NN>.json`. Write `_index.md` at the date root listing the three topics, the angle for each, and the source links.

How you write it depends on where you run. When Drive for Desktop is mounted (a local manual run), assemble the folder directly on the mount at `<My Drive>/Pietro Dispatch/<DATE>/` and let it sync. That avoids pushing multi-megabyte PNGs through the Google Drive connector, which is slow and floods the context with base64. In the cloud routine, where there is no mount, use the connector. Either way, strip any `.DS_Store` macOS drops into the folder before you call it done.

Before the first upload of a session that writes to Drive, confirm with Pietro. After that, proceed.

## Notes

- Never put a credential in any file or log.
- The accent substring is matched against the headline by a literal string replace in the template, so it must be an exact substring.
- Caption files contain the post body only, not the headline; the headline lives on the card.
- When re-running the images for a date that already produced cards (a look change or a reroll), archive the current `bg-*` and `post-*` as `*_old.png` first, in both `work/<DATE>/` and the Drive folder, then regenerate. Nothing gets overwritten without a copy.
- Keep everything you write free of em dashes.
