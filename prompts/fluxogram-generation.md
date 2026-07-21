# Fluxogram generation

You design one fluxogram: a durable idea laid out as a wide six-card horizontal flow, in Pietro's voice (`PIETRO_WORKS_VOICE.MD` sections 1 to 4, filtered by `HUMANIZE.md`; §4 holds the emoji carve-out). A fluxogram teaches one evergreen concept as an ordered method: six steps left to right, one of them the pivot the whole idea turns on. Output the spec the renderer consumes and the caption that ships under it. Ground every step in Pietro's real practice and first principles, never a fetched article. No em dashes.

The template is `renderer/fluxogram.html` (`renderFluxo(spec)`); the renderer is `renderer/fluxogram.mjs`. The design canvas is 1600x548, delivered at 2400x822 PNG. There is no auto-fit and no fit gate. Every line is placed as written, and the mono lines are `white-space:nowrap`, so a line that runs too long does not wrap, it overflows the card and gets clipped. Length discipline is on you, not the renderer.

## The spec, field by field

A spec is one JSON object. Top-level fields:

- `kick`: the concept name, shown in the top-left pill (`The eval loop`, `Build vs buy`). Two to four words, no period. This is the fluxogram's title.
- `flow`: the three-beat spine, top-right, uppercased by the template. Three short verbs joined by ` · `, with the middle beat wrapped in `<b>…</b>` so it renders in the gradient. It names the arc: `spec · <b>score</b> · ship`, `profile · <b>route</b> · measure`. The bold beat is usually the pivot step's verb.
- `cards`: exactly six card objects, described below. Six is the format, not five, not seven.
- `footL`: a plain value line, bottom-left. The promise in flat words: `every prompt edit, every model swap`.
- `footR`: the payoff, bottom-right, with one `<b>…</b>` gradient phrase carrying the number or the sharp claim: `same answer, <b>a third of the cost</b>`.
- `bg`, `bgPos`, `bgOpacity`: the background (see Background).

## The six cards

Each card is `{ num, glyph, name, l1, l2 }`, and exactly one card also carries `hero: true` and a `tag` (the pivot, below).

- `num`: `01` through `06`, in order.
- `glyph`: a name from the glyph library in `renderer/fluxogram.html` (the `G` map: `search`, `code`, `image`, `frame`, `shield`, `lock`, `gauge`, `barchart`, `send`, `eye`, `dollar`, `wrench`, `user`, `usercheck`, `refresh`, `inbox`, `filter`, `flag`, `database`, `listchecks`, `activity`, `cpu`, `zap`, `layers`, `gitbranch`, `target`, `cloud`). Pick the one that reads as the step's action. An unknown name falls back to `frame`, so use an exact key. If nothing fits, add a new stroke icon to `G` in the template rather than forcing a wrong one.
- `name`: the step, one word, Clash Display at 29px. One word keeps it on one line inside the card: `Freeze`, `Route`, `Approve`, `Measure`. Use two short words only if both are tiny.
- `l1`, `l2`: two mono lines under the name, ~14px, `nowrap`. This is the tight constraint: each line must fit the card at that size or it clips. A normal card is 216px wide with 22px padding, so roughly 20 to 22 monospace characters is the ceiling per line; keep each to about 14 to 18 and you are safe. The hero card is wider (250px) and holds a couple more. Write them as a short phrase pair, not a sentence: `real inputs` / `trusted answers`, `the prompt` / `drop dead tokens`.
- Highlight one line, at most, with `<span class="hi">…</span>` (cyan) or `<span class="hg">…</span>` (green) to mark the card's point. Not every card needs it; use it where the phrase is the takeaway.

## The pivot (hero card)

Exactly one of the six carries `hero: true`. The template renders it wider, with a gradient border, a gradient glyph, and a `tag`. This is the step the whole concept turns on: the gate that refuses a bad result, the route decision, the human sign-off, the last-mile glue. Put it at the beat where the idea would fall apart if you skipped it, usually card 03, 04, or 05, not the ends.

- `tag`: a short mono chip under the hero's lines, the punchline of the pivot in three to five words: `no regressions`, `right model per job`, `no silent writes`, `you build this`. Keep it under ~26 characters so the chip does not overflow.
- The hero's `l1`/`l2` carry the sharpest cut of the concept; lean on a `hi` span here.

## Background

No GPT Image 2 call. Pick one still frame from the shared library at `pietro-works-env/queue/Pietro Dispatch/2026-06-30/bg-db/` (`bg-01.png` to `bg-20.png`), cold steel with one contained warm glow, the same look rule as the feed modules. `bg` is the path (absolute is fine and is what the archived specs use); the renderer inlines it as a data URL. Pick a frame no recent fluxogram used, so the set does not repeat a background. Tune `bgPos` (e.g. `50% 38%`) so the warm accent sits behind the cards without fighting the text, and `bgOpacity` around `0.46` to `0.5` so the scrim keeps the copy legible.

## Caption

The post body that ships under the PNG. It frames the idea; the diagram carries the teaching, so the caption never restates the six cards. The fluxogram caption is its own short shape, tighter than the slides caption:

- A diamond opener line, one sentence, starting with the brand diamond 💠. The sharp claim that makes someone stop: `💠 A prompt is production logic that nothing type-checks.`
- One blank line, then one short paragraph of insight, two or three sentences that give the why without walking the steps.
- One blank line, then exactly two hashtags on their own line: `#PietroWorks #OpenToDisruption`. Not the slides hashtag set, not a bespoke list. These two, always, cased exactly as written.
- The 💠 is mandatory and survives the humanize pass (the voice carve-out over `HUMANIZE.md`'s emoji ban). No other emoji. No em dashes, no banned words. Ground any number with its task and baseline.

## Output

Return strict JSON, nothing else, no fences. The spec object and the caption:

```json
{
  "spec": {
    "kick": "The eval loop",
    "flow": "spec · <b>score</b> · ship",
    "bg": "/abs/path/.../bg-db/bg-08.png",
    "bgPos": "50% 24%",
    "bgOpacity": 0.5,
    "footL": "every prompt edit, every model swap",
    "footR": "the <b>score</b> decides, not the demo",
    "cards": [
      { "num": "01", "glyph": "lock", "name": "Freeze", "l1": "real inputs", "l2": "<span class=\"hi\">trusted answers</span>" },
      { "num": "02", "glyph": "code", "name": "Prompt", "l1": "one clear job", "l2": "not a vibe" },
      { "num": "03", "glyph": "gauge", "name": "Score", "l1": "run the set", "l2": "<span class=\"hi\">get a number</span>" },
      { "num": "04", "glyph": "barchart", "name": "Compare", "l1": "new vs last", "l2": "did it drop?" },
      { "num": "05", "glyph": "shield", "name": "Gate", "hero": true, "l1": "<span class=\"hi\">a lower score</span>", "l2": "does not ship", "tag": "no regressions" },
      { "num": "06", "glyph": "send", "name": "Ship", "l1": "only what beat", "l2": "the last score" }
    ]
  },
  "caption": "💠 A prompt is production logic that nothing type-checks.\n\nFreeze a golden set of real inputs, score every prompt and model change against it, and let the number decide what ships. The demo is not the test.\n\n#PietroWorks #OpenToDisruption"
}
```

Rules that keep it aligned:
- Exactly six cards, exactly one with `hero: true`.
- Every mono line short enough not to wrap; when in doubt, cut a word.
- `flow` and `footR` each carry exactly one `<b>` gradient span; `kick` and `footL` carry none.
- The orchestrator writes `spec` to `spec.json` and `caption` to `caption.txt`.
