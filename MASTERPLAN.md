# Pietro Dispatch — master plan

A pipeline that runs on odd days of the month and drops a finished folder in Google Drive: three AI-news topics, two post variations each, every variation a 2160×2160 branded card plus a ready-to-post caption. The thinking runs on Anthropic's cloud. The images come from GPT Image 2 on Pietro's OpenAI key. The cards render through Pietro's existing `news.html` template.

This file is written for Claude Code. Read it top to bottom, then follow the build manifest at the end. Wherever it says a file is "in Drive," it means the `pietro.works` folder in Pietro's Google Drive, which you can reach through the connected Google Drive. Copy those into the repo at the paths given. Do not recreate them.

Keep all prose you generate free of em dashes, per `HUMANIZE.md`.

---

## 1. The system in one view

Four things, nothing else:

- One GitHub repo (this package, fleshed out) connected to Claude Code.
- One Google Drive folder, `Pietro Dispatch/`, that receives the output.
- One Claude Code routine on Anthropic cloud, scheduled on odd days, laptop closed.
- One secret: Pietro's `OPENAI_API_KEY`, set in the routine, never in the repo, never shown to anyone.

Each run is a fresh routine session. It searches the web, picks and writes the content, generates the images, renders the cards, and uploads the dated folder to Drive.

---

## 2. Files Pietro already has (in the `pietro.works` Drive folders)

Pull these into the repo. Do not regenerate them; they are the source of truth. These are now vendored into the repo at the paths below; the Drive locations are recorded here as the upstream source if they ever need refreshing.

The render assets (`news.html`, `pietro-portrait.png`, the three `hero-dot-matrix-static.*`) live in `pietro.works/quotes/`, the quote-card project the renderer was adapted from. Copy the live `news.html` from there, since that is the file Pietro edits by hand. The brand visual system (`pietro-tokens.css`, `DESIGN.md`, and the design references) lives in `pietro.works/design/`. That is the source of truth for color, type, and the gradient accent, so any new brand asset must match it.

- `PIETRO_WORKS_VOICE.MD` → copy to `prompts/PIETRO_WORKS_VOICE.MD`. The brand voice. Sections 1 to 3 drive generation, section 4 is the revision pass, section 2.7 holds real posts to imitate. This outranks any voice description elsewhere.
- `HUMANIZE.md` → copy to `prompts/HUMANIZE.md`. Typography and anti-pattern rules. Applies to the post bodies and to anything you write.
- `news.html` → copy to `renderer/news.html`. The 1080 card template that exports at 2160. You will patch it per `renderer/news.html.fit-patch.md`.
- `tools/export-quote-images.mjs` → reference only, do not copy. It is the quote exporter that `renderer/news.mjs` is adapted from. Read it to confirm the CDP and static-server approach; `news.mjs` in this package already carries that approach.
- Renderer assets the template needs at render time → copy into `renderer/`: `pietro-portrait.png`, `hero-dot-matrix-static.avif`, `hero-dot-matrix-static.webp`, `hero-dot-matrix-static.png`.
- `dispatch-001.png`, `dispatch-004.png` → reference only. Examples of finished cards, for visual calibration. Do not ship.

If any of these are missing from Drive at build time, stop and ask Pietro rather than inventing a substitute.

---

## 3. Files in this package (new)

- `MASTERPLAN.md` — this file.
- `.claude/skills/dispatch/SKILL.md` — the workflow the routine follows each run.
- `prompts/curation.md` — how the three topics are chosen.
- `prompts/generation.md` — the per-variation artifact spec, the text-disposition targets, and the exact mapping to the template's fields.
- `sources.yaml` — the AI sources to pull from.
- `renderer/news.mjs` — the export script, adapted from the quote exporter, driving `news.html` headlessly and screenshotting each card at 2160.
- `renderer/news.html.fit-patch.md` — the two precise edits that give the headline clean line breaks and kill orphan words.
- `pipeline/generate-images.mjs` — the GPT Image 2 call: generate at 1088 square, crop 4px off each side to land on 1080.
- `routine.txt` — the prompt and cron expression for the scheduled routine.

---

## 4. Final repo layout

```
pietro-dispatch/
  MASTERPLAN.md
  routine.txt
  sources.yaml
  package.json                      you create this, deps below
  .claude/skills/dispatch/SKILL.md
  prompts/
    PIETRO_WORKS_VOICE.MD           from Drive
    HUMANIZE.md                     from Drive
    curation.md
    generation.md
  renderer/
    news.html                       from Drive, then patched
    news.html.fit-patch.md
    news.mjs
    pietro-portrait.png             from Drive
    hero-dot-matrix-static.avif     from Drive
    hero-dot-matrix-static.webp     from Drive
    hero-dot-matrix-static.png      from Drive
  pipeline/
    generate-images.mjs
  work/                             scratch, gitignored, one subfolder per run date
```

`package.json` needs two dependencies, `openai` and `sharp`, and `"type": "module"`. Node 20 or newer.

---

## 5. What runs where

Everything except the render runs in the cloud routine with the laptop closed: the web search, the curation, the writing, the GPT Image 2 calls, and the Drive upload. The render needs a real Chromium, and whether the routine's sandbox can launch one is the single thing to verify first.

- If the sandbox can run Chromium: the whole job is cloud. Nothing runs on Pietro's machine day to day.
- If it cannot: only `news.mjs` drops local. The cloud run still searches, writes, generates the backgrounds, and uploads them plus a `cards.json` to that day's Drive folder. A local trigger then runs `news.mjs` against those backgrounds and uploads the finished cards. Everything else stays cloud.

Verifying the render in the sandbox is step 3 of bring-up. The rest of the design is identical either way, so build for cloud and fall back only if that test fails.

---

## 6. The daily run, step by step

The routine prompt tells you to run the `dispatch` skill. The skill does this:

1. Search the sources in `sources.yaml` and the open web for the day's AI news. Curate three topics per `prompts/curation.md`.
2. For each topic, write two variations per `prompts/generation.md` and `PIETRO_WORKS_VOICE.MD`. Each variation is a category, a full headline, the exact accent substring, a summary, a post body, and an image prompt.
3. Stage the run under `work/<date>/`: write `prompts.json` (six image prompts), `cards.json` (six card records), and six caption files.
4. Run `pipeline/generate-images.mjs` to produce six backgrounds at 1080.
5. Run `renderer/news.mjs` to render six cards at 2160.
6. Assemble the dated Drive folder and upload it. Locally, with Drive for Desktop mounted, write straight to the mount and let it sync; in the cloud routine use the Google Drive connector. The skill carries the detail.

Steps 1, 2, and 6 are your reasoning and the connector. Steps 4 and 5 are the two scripts.

---

## 7. The scripts and the patch

`pipeline/generate-images.mjs`. Reads `work/<date>/prompts.json`, an array of `{ id, image_prompt }`. For each, calls GPT Image 2 at `size: "1088x1088"`, `quality: "medium"`, takes the returned base64, crops 4px off every side with sharp to land on exactly 1080×1080, and writes `work/<date>/backgrounds/bg-<id>.png`. Needs `OPENAI_API_KEY`. 1088 is used because GPT Image 2 rejects edges that are not divisible by 16, and 1080 is not; the 4px crop removes the difference.

`renderer/news.mjs`. Reads `work/<date>/cards.json`, an array of `{ id, category, headline, highlight, summary, bg }` where `bg` is a path relative to the run folder. Serves the run folder over local HTTP, loads `renderer/news.html` in headless Chromium over CDP at deviceScaleFactor 2, and for each card sets the fields and the background by calling the template's own functions, runs the fit pass, and screenshots the `#news` element. It validates each output is exactly 2160×2160 and writes `work/<date>/cards/post-<id>.png`. Chromium is resolved from `CHROME_BIN`, then common locations. This is the same CDP and static-server pattern as the quote exporter, with news selectors and a per-card background step the exporter never needed.

`renderer/news.html.fit-patch.md`. Two edits. First, the headline switches from `text-wrap:pretty` to `text-wrap:balance`, which evens every line and removes a stranded word at the top or bottom. Second, `fitHeadline()` is replaced with a version that keeps the height fit and adds a guard binding the last two words so the last line can never be a single word. Apply both before rendering anything.

---

## 8. Output in Drive

```
Pietro Dispatch/
  2026-06-01/
    candidate-01-<slug>/
      bg-1.png  bg-2.png            backgrounds, 1080
      post-1.png  post-2.png        finished cards, 2160
      caption-1.txt  caption-2.txt  post body plus hashtags, paste-ready
      meta.json                     per variation: category, headline, highlight, summary, image prompt, source url
    candidate-02-<slug>/
    candidate-03-<slug>/
    _index.md                       the day's three topics, the angle for each, and source links
```

Variations align by index: `bg-1`, `post-1`, and `caption-1` are one variation. The headline and subheading are baked into `post-N.png`; `caption-N.txt` is the body that goes under the image.

---

## 9. What Pietro needs, and one-time setup

One-time, both paths:

- A GitHub repo with this project, connected to Claude Code.
- OpenAI Organization Verification completed in the developer console. Without it, GPT Image 2 calls fail. This blocks everything, so do it first.
- `OPENAI_API_KEY` added as a secret on the routine.
- Google Drive connected in Claude, with a top-level `Pietro Dispatch/` folder.
- The routine created with the day-of-month cron in `routine.txt`.

Daily, cloud path: nothing runs locally.

Render-fallback path only: Node 20+ and Chrome, the repo cloned locally, and a local trigger, either a Cowork scheduled task in Claude Desktop or a launchd job. The Mac must be awake when that render fires; Cowork catches up on the next wake.

Fonts need no install. Clash Display loads from Fontshare and DM Sans and Mono from Google Fonts at render time, and both scripts wait for `document.fonts.ready`.

---

## 10. Cost and cadence

Odd days 1 to 27 is 14 runs a month. Six images a run at GPT Image 2 medium at the 1080 size is roughly five cents an image, about four dollars a month. Ten dollars covers a little over two months. The background is scaled 2x into the 2160 export, so under the scrim it reads slightly soft, which is fine for a feed. If Pietro wants it sharper later, raise the gen size to 1536 in `generate-images.mjs` at higher cost; nothing else changes.

---

## 11. Bring-up order

1. Run `generate-images.mjs` on a single test prompt. Confirm a 1080 background lands and the OpenAI key and verification work.
2. Patch `news.html`, then run `news.mjs` on one hand-written `cards.json` with that test background. Confirm a clean 2160 card, brand fonts loaded, headline breaking without an orphan.
3. Run `news.mjs` inside the cloud routine sandbox. This settles the cloud-versus-local fork. If Chromium will not launch, switch the render step to the local trigger and leave the rest cloud.
4. Wire search, curation, and writing through the skill. Confirm the three topics and the variations read right against the voice doc.
5. One full manual run end to end into Drive. Inspect the folder.
6. Attach the odd-day cron and let it run.

---

## 12. Build manifest for Claude Code

Do these in order:

1. Initialize the repo and `package.json` with `"type": "module"` and dependencies `openai` and `sharp`. Add `work/` to `.gitignore`.
2. Pull from the `pietro.works` Drive folder into the repo: `PIETRO_WORKS_VOICE.MD` and `HUMANIZE.md` into `prompts/`; `news.html`, `pietro-portrait.png`, and the three `hero-dot-matrix-static.*` files into `renderer/`.
3. Apply `renderer/news.html.fit-patch.md` to `renderer/news.html`.
4. Confirm `pipeline/generate-images.mjs` and `renderer/news.mjs` match the data contracts in sections 6 and 7. They are written to those contracts; adjust only if you change the contract.
5. Read `.claude/skills/dispatch/SKILL.md`, `prompts/curation.md`, and `prompts/generation.md`. These are the reasoning layer; treat them as the run instructions.
6. Walk the bring-up order in section 11. Do not attach the cron until a manual run has produced a correct Drive folder.

Stop and ask Pietro before any step that needs a credential he has not provided, and before the first upload that writes to his Drive.
