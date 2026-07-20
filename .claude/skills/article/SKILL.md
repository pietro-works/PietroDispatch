---
name: article
description: Make a LinkedIn Article Cover banner (1920x1080) in the Pietro.works DISPATCH look. Use when Pietro asks for an article cover, article banner, or newsletter header. Takes an article title or draft, writes two cover variations, generates wide backgrounds with GPT Image 2, renders through article.html, and delivers to the Pietro Articles queue.
---

# Article Banner

You are producing the cover banner for one LinkedIn article. The banner is 1920x1080, the article cover size LinkedIn recommends. Look and voice are governed by `prompts/article-generation.md` (artifact spec, layout-safety rules for image prompts) on top of `prompts/PIETRO_WORKS_VOICE.MD` and `prompts/HUMANIZE.md`. Follow those files; this one is the sequence and the data contracts.

Input: the article's title or draft (from Pietro or a file he points at), plus an optional category and series kicker. If there is no article text at all, ask for at least a title and angle; do not invent an article.

Set `DATE` to today in `YYYY-MM-DD` and derive a short kebab `slug` from the article. Staging lives under `work/article-<DATE>-<slug>/`.

## Step 1 — Write

Write two variations per `prompts/article-generation.md`: category, kicker, headline, exact highlight substring, deck (may be empty), image prompt. Two genuinely different covers, not one reworded.

## Step 2 — Stage

Write under `work/article-<DATE>-<slug>/`:

- `prompts.json` — `[{ "id": "1", "image_prompt": "..." }, { "id": "2", "image_prompt": "..." }]`.
- `banners.json` — `[{ "id": "1", "category": "...", "kicker": "ARTICLE", "headline": "...", "highlight": "...", "deck": "...", "bg": "backgrounds/bg-1.png" }, ...]`. Optional `headlineSize` (integer px) pins a specific two-line break; omit for auto-fit.
- `meta.json` — `{ slug, title, angle, sources: [...], variations: [{ category, kicker, headline, highlight, deck }, ...] }`. The validator requires a top-level `variations[]` array with non-empty `headline` and `highlight` strings per entry.

## Step 3 — Backgrounds

Run `node pipeline/generate-images.mjs --in work/article-<DATE>-<slug>/prompts.json --out work/article-<DATE>-<slug>/backgrounds --format wide`. Wide format generates 1920x1088 and crops to exactly 1920x1080. Requires `OPENAI_API_KEY`; same account-state caveats as news (401/403 is billing or verification, not a prompt bug). If one image is blocked, rephrase that prompt and retry rather than failing the run.

## Step 4 — Render

Run `node renderer/article.mjs --banners work/article-<DATE>-<slug>/banners.json --root work/article-<DATE>-<slug> --out work/article-<DATE>-<slug>/banners --check-fit`. Each banner comes out exactly 1920x1080. The fit line per banner is `h=<lines>L@<size>px d=<lines>L/<fill>%`: headline 1 or 2 lines, deck 0 to 2 lines with no stub second line. Treat any `[fit FAIL]` as a blocker; fix the copy, not the renderer.

Then eyeball both banners: headline breaks clean, the accent phrase reads, the left text column sits over calm image area, the warm accent landed in the right third, nothing important hugs the extreme top or bottom edge (feed crop).

## Step 5 — Deliver

Build `pietro-works-env/queue/Pietro Articles/<DATE>-<slug>/` on the Drive mount:

- `banner-1.png`, `banner-2.png` — the two covers, 1920x1080.
- `bg-1.png`, `bg-2.png` — the raw backgrounds (optional but keep them).
- `meta.json` — from staging.
- `caption.txt` — optional: the share-post text if Pietro asked for one, per the DISPATCH voice.

Strip `.DS_Store`. Validate: `node ../pietro-enterprise/registry/contracts/validate-contract.mjs "<folder>"` must exit 0. Then run the two enterprise gates (Brand Guardian, Validator) per `../pietro-enterprise/skills/review/SKILL.md`.

Archive: `node pipeline/archive-to-dispatch-posts.mjs "<folder absolute path>"` copies it into `pietro-works-env/dispatch-posts/` as the next `article-NNN` (`-b` for variation 2). The queue folder stays intact.

The banner is uploaded manually when Pietro publishes the article on LinkedIn; Studio indexes it for browsing but never auto-posts an article cover.

## Notes

- Never put a credential in any file or log.
- The highlight substring is matched by literal string replace; exact substring or no accent.
- Keep everything you write free of em dashes.
- One article, one folder. Re-running for the same article overwrites its own staging; archive `*_old.png` copies first if banners were already delivered, same rule as news.
