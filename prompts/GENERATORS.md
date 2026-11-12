# GENERATORS.md: what every generator can do

Read this FIRST, before choosing a format or structuring any post. It lists every lever each renderer exposes, so a post is designed from the full toolbox instead of the habitual subset. Specs below are what the headless drivers accept; the editors can do more in places and those gaps are flagged.

Sources: audited against the code on 2026-10-28; quote and LinkedIn banner added and Studio re-audited 2026-11-12. Line refs are in renderer/ (`news.*`, `article.*`, `slides.*`, `fluxogram.*`, `tutorial.*`, `quote.*`, `linkedin-banner.{dark,light}.html`).

PACS0010 ties this file to the renderers: a new lever, field or format in any renderer means an edit here in the same change.

## Choosing a format (pick by what the idea is, not by habit)

| Idea shape | Format | Why |
|---|---|---|
| A fresh development, one stance, one image | news card (2 per candidate) | fastest, single beat, 2160 square |
| A concept that needs contrast or a short method | slides carousel (PDF document) | B hero, C before/after, A three steps, contact |
| A durable process with a hinge step | fluxogram | six cards, one hero card, wide 2400x822 |
| A hands-on how-to a reader can follow | tutorial | 1 to 8 image cells with captions and connectors, 2160 square |
| A deep argument | article cover (1920x1080) + article text | cover only; text is written separately |
| A standalone line | quote card | one `quotes.tsv` row, 2160 square, headless via `quote.mjs` |
| Not a post: the LinkedIn profile cover | banner | see §7, browser export only |

Combine, do not default: the same idea can run as a fluxogram one week and a tutorial the next. Prefer the lever that makes the idea visible (a contrast is slides C, a sequence with a hinge is a fluxogram, a procedure with screenshots is a tutorial).

---

## 1. News card

Output `post-<id>.png` 2160x2160. Command: `node renderer/news.mjs --cards cards.json --root <dir> --out <dir> [--check-fit] [--month M] [--year Y]`.

Spec per card: `id`, `category` (free text, default NEWS, uppercased into the pill; any short label works), `headline`, `highlight` (exact case-sensitive substring, FIRST occurrence only, silent no-op if missing), `summary` (plain text), `bg` (path under --root), `headlineSize` (cap in px, 48 to 96, auto-shrink still applies below it).

Hard fit gates: headline at most 2 lines; summary EXACTLY 2 lines with the second line 75 to 99 percent full; no lone word on any line. Headline under 56px is a warning. Summary has no size lever, tune by word count.

Fixed, no lever: kicker (`Pietro.works` + `DISPATCH`), footer portrait and wordmark, scrim, dot matrix, bg position `50% 42%`.

Gaps: `--cat` colour is dead (no CSS reads it; category is label only). Editor can add logo or image overlays and many accent spans; spec cannot. Unsharp pass runs only in editor export. Footer month and year default to the render machine clock; pass `--month` and `--year` when re-rendering an old card.

## 2. Article cover

Output `banner-<id>.png` 1920x1080. Command: `node renderer/article.mjs --banners banners.json --root <dir> --out <dir> [--check-fit]`.

Spec: `id`, `category`, `kicker` (free text, default ARTICLE, article-only lever, e.g. a series name), `headline`, `highlight`, `deck` (optional, `""` gives a headline-only cover), `bg`, `headlineSize` (cap, 64 to 180; floor 80).

Gates: headline at most 2 lines; deck at most 2 lines and a 2-line deck's second line at least 40 percent full; deck dead zone is roughly 62 to 90 characters; no lone words. Image must be right-weighted, left 55 percent calm.

Gaps: no `--month` or `--year` pin, so re-rendering restamps to today. `--cat` colour is dead. No overlay UI. Unsharp is editor only.

## 3. Quote card

Output `pietro-quote-NNN.png` 2160 square, light theme. Command: `node renderer/quote.mjs [--out <dir>] [--tsv <quotes.tsv>] [--ids all|1-5,9] [--force] [--batch 30] [--chrome <path>]`. Input is a row in `quotes.tsv` (`id`, `quote`, `highlight`); the default tsv is the quote library at `../pietro.works/gen/quote/quotes.tsv`. The template is `renderer/quote.html`, served by the driver with `/quotes.tsv` mapped to the chosen file. Existing valid PNGs are skipped unless `--force`. `--out` defaults to `pietro-works-env/assets/linkedin-images-2160/`, the library `tools/scan-assets.mjs` indexes for Studio. A quote enters the Studio queue when three things exist: its row in `quotes.tsv`, its image in the library, and a `## Post NNN` caption (the LinkedIn post text) in `../pietro.works/gen/quote/linkedin-posts.md`. Studio's refresh log names whichever is missing. No row cap. Quotes the retired legacy scheduler already posted (frozen `queue.tsv`, status scheduled or skipped) never come back (PACS0009). In Studio, the hub's Quote card opens `quote.html` with the live library (studio-server aliases `/renderer/quotes.tsv`).

This replaces the old `tools/export-quote-images.mjs` in the quote repo, which refused to run on a hash pin and capped at 180 rows. A 2160 render of quote 001 differs from the delivered library image by about 1.6% mean pixel difference (text antialiasing and dot-matrix only). No ad hoc quote spec exists; add a row to the tsv. Editor can change eyebrow, name, role, overlays; the driver cannot.

Known data defects: quotes 086 and 133 have a `highlight` that is not a substring, so no accent renders.

## 4. Slides

Output `post-<id>.png` 2160 square per slide plus `slides.pdf` (1080 pages). Command: `node renderer/slides.mjs --deck slides.json --root <dir> --out <dir> --pdf <file> --check-fit`.

Deck: `{ topic, slides: [...] }`. `topic` is shown top-right (convention `IN_THE_LOOP.MD`). Page count has no code cap; convention is hero + 1 to 3 content + contact.

Common fields: `id` (filename, keep unique), `bg` (relative path, data URL, or number 0 to 3 for a brand gradient placeholder, no image needed), `hl` (accent phrase, first occurrence, swallows trailing punctuation), `titleSize` (px, undocumented before, default 74, editor range 40 to 96; shrinks a long line instead of rewriting copy; does not affect steps, glabel or contact block).

Types:
- B hero: `hero:[l1,l2]` (line 2 is dimmer), `hl` applies to BOTH lines, `glyphs:[...]` any strings (editor cycle list `○◆◎●◇□■▲△✦⚙◉`; `⬡` and `◈` from the old prompt are not in it), fixed `→` between glyphs, optional `glabel`.
- C before/after: `before` and `after` (`\n` breaks), `bgTop` (forced grayscale, opacity .36) and `bgBot` (saturate .7, opacity .5), `hl` applies to `after` only. Falls back to `bg`.
- A steps: `title:[l1,l2]`, `hl` applies to line 2 ONLY, `steps:[...]` auto-numbered 01.., no count cap, 3 is the design.
- contact: `line:[l1,l2]` (hl on both), `name`, `role`, `cta`, fixed portrait.

Fixed, no lever: wordmark, frame, scrim, bg opacity .42 and saturate .6 for A/B/contact, bg position `50% 42%`.

Gates: accent at most 2 lines, title at most 2 lines, no stray word. Nothing checks glyph row overflow, step count, contact widths or vertical collisions. Uniform font by design: edit copy to fit, never auto-fit (memory: slides-uniform-font-no-autofit).

Gaps: editor cannot add, remove, reorder slides or change types; data URL mime is hard-labelled png (use PNG).

## 5. Fluxogram

Output one PNG 2400x822. Command: `node renderer/fluxogram.mjs --data spec.json --out out.png --format png --width 2400`.

Spec: `kick`, `flow` (inline `<b>` is gradient only here and in footR), `footL`, `footR`, `bg` (path resolved against the spec dir; library `queue/Pietro Dispatch/2026-06-30/bg-db/bg-01..20.png` or an own image), `bgPos` (default `43% 30%`), `bgOpacity` (default .5), `cards` (exactly six, one `hero:true` with a `tag`).

Card: `num`, `glyph`, `name`, `l1`, `l2` (`<span class="hi">` cyan and `<span class="hg">` green work only inside l1 and l2), `hero`, `tag` (hero only).

Glyphs (27): search, code, image, frame, shield, lock, gauge, barchart, send, eye, dollar, wrench, user, usercheck, refresh, inbox, filter, flag, database, listchecks, activity, cpu, zap, layers, gitbranch, target, cloud. Unknown name falls back to frame. Custom glyph: add `{s:'<svg inner>'}` to `G`.

Previously undocumented, all supported by the renderer:
- `arr` (global connector character, default `→`), `arrs:[...]` (per gap), `arrColor`. Useful characters: `+` for combine, `/` for alternative, `·`, `⇒`, `▸`. Use `+` or `/` when the cards are not a strict sequence.
- `tint`: per-element colours for `kick`, `flow`, `footL`, `footR`, `arrs[]`, and per card `num`, `glyph`, `name`, `lines`, `tag` (background), `bg`. Caveats: tint on a hero glyph is overridden by the gradient; `<span>` colours and the `<b>` gradient win over tint.

Limits: `l1` and `l2` are monospace 14px nowrap, so lines over about 18 characters clip silently. `name` wraps (long names grow taller). No fit gate, no card-count check, missing text prints "undefined". Editor Download PNG is not pixel-equal to the headless render (backdrop blur flattened); delivered PNGs come from `fluxogram.mjs`. The editor drops HTML in name, num and tag and caps cards at six on import.

## 6. Tutorial

Output `tutorial.png` 2160 square. Command: `node renderer/tutorial.mjs --spec spec.json --root <dir> --out tutorial.png`. Images must be PNG.

Layout: `top` 1 to 4 cells, `bot` 0 to 4 (a second row). `size` s, m, l (frame width; one row 290, 346, 402px; two rows 180, 198, 210). `shape` rect or circle, `radius` 0 to 120 (rect only), `hsize` headline 34 to 78, `scrim` 0 to 100 (default 60), `blur` 0 to 20 (default 0), `bg` backdrop (fixed opacity .6, position `50% 42%`).

Text: `text` with `tbLeft`, `tbRight`, `eyebrow`, `headline` (HTML, accent with `<span class="accent">`), `idName`, `idRole`, `idCta` (innerHTML, so HTML works; omitting `headline` leaves the placeholder text).

Cells: `{ key:"<row>-<col>", img, num, name, sub, tf }`. A cell outside the grid is ignored silently. `top` and `bot` have no defaults in the driver: always set both.

Connectors (added to the driver 2026-10-28; default render byte-identical):
- `hConn: { "<row>-<col>": { t, dir, n } }` is the gap AFTER column col in that row. `t`: `arrow` (default), `line`, `dashed`, `x`, `plus`, `num` (a numbered badge, `n` is its text), `none`. `dir`: `fwd` or `back`, arrows only.
- `vConn: { "<col>": { t, dir, n } }` is between the top and bottom row, only for columns both rows share. Default `none`; `dir` `up` or `down`.
- `tf: { z, px, py }` per cell: zoom 1 to 3 and pan inside the frame (pan is clamped to cover). Absent means fit.

Use them: `plus` for combine, `x` for a thing to avoid, `dashed` for optional, `num` for ordered badges, `back` for a loop, a second row with `vConn` for before and after.

Gaps: headless has no unsharp pass (editor download applies radius 1.0, amount .35), so a delivered PNG is slightly softer than a manual download. Backdrop position and opacity are not in the spec.

Delivery: folder `<DATE>-<slug>` with `tutorial.png`, `caption.txt`, `meta.json`, `bg.png` (raw backdrop), `spec.json`. Staging `work/tutorial-<DATE>-<slug>/`. Archive keeps `bg.png` as `bg-tutorial-NNN.png` (fixed 2026-10-28).

---

## 7. LinkedIn profile banner

Output 1584x396 cover, plus a 2x at 3168x792. Hand-exported, no CLI: open `renderer/linkedin-banner.dark.html` or `renderer/linkedin-banner.light.html` in a browser and use the Download 1x / 2x buttons (4x supersample, unsharp mask). The page also has a profile-photo and mobile-crop guide toggle that is stripped from the export.

Dark is the source of truth, built on the site's dark tokens (`#060a12`, cyan `#39e8ff`, green `#00ff99`, purple `#a855f7`) with the accent glow held at 60% of the first dark pass. Light is the original design, kept in step with it: same geometry, only colours differ. The mono subline is sized so its last word ends flush with the right edge of "existed" on the line above (19.45px). Headline is Clash Display 600 (the original PNG was DM Sans 700 only because Clash failed to load when it was made). The dot-matrix images beside the HTML must stay in `renderer/` or the texture silently disappears. Reference exports live in `docs/assets/linkedin-banner/`.

## What is exposed where

- The Studio hub (index.html) opens every template: Schedule, Fluxogram, News, Slides, Article, Tutorial, Quote, Banner.
- Studio can re-render fluxogram, slides and tutorial through `/api/render` (RENDER_KINDS). Only fluxogram and slides editors call it; the tutorial editor has no render-to-archive button. News, article and quote render through their CLI drivers. Studio renders land in dispatch-posts only and do not become queue assets.
- The LinkedIn banner is browser-only: not indexed, not queued, not renderable through `/api/render`.
- Studio indexes news, slides, article, fluxogram, tutorial and quote (every quotes.tsv row with image + caption, minus quotes posted before Studio).
- The enterprise registry has no capability field and no quote module; this file is the capability reference.

## Known defects not fixed here

- `validate-contract.mjs` does not enforce `bg.png` or `spec.json` for tutorials though the contract requires them.
- `scan-assets.mjs` has no mixed-signal guard (a folder with `tutorial.png` and `banner-1.png` indexes twice).
- Quotes 086 and 133: `highlight` is not a substring of the quote (quotes.tsv data), so no accent renders.
