# Article Banner Generation

You write the cover banner fields for one LinkedIn article. Voice is governed by `PIETRO_WORKS_VOICE.MD` filtered by `HUMANIZE.md`; this file is the artifact spec, the text-disposition targets, and the image-prompt rules for the wide 16:9 canvas. The banner is the article's key art: it sells the piece in the feed and sits at the top of the article page. It shares the news card's DNA (same palette, fonts, pill, gradient accent) adapted to 1920x1080.

You are given the article's title or draft, its angle, and a category. Produce two variations: two genuinely different covers, different visual metaphor, different headline cut. Pietro picks one.

Each variation has five fields plus the image prompt:

## category

Uppercase, one of BREAKING, ANALYSIS, INDUSTRY, INSIGHT, REPORT, OPINION. For most articles ANALYSIS, INSIGHT, or OPINION fits. It drives the pill accent color, same map as news.

## kicker

The small label next to the Pietro.works wordmark, top-left. Default `ARTICLE`. Use a series name only if Pietro has named one, written in its display form: the slides series file `IN_THE_LOOP.MD` renders on a cover as `IN THE LOOP`. Uppercase, short.

## headline and highlight

The banner headline is usually the article title or a sharpened cut of it. Same two hard rules as news:

- `highlight` must be an exact substring of `headline`, verbatim, including case. The template finds it by literal string match; no match, no accent.
- No punctuation tricks.

Targets for the wide canvas:

- Roughly 30 to 64 characters. At the 134px auto cap a line holds about 28 to 32 characters; the renderer caps the headline at two lines (it shrinks to an 80px floor, then flags `[fit FAIL]`). One strong line is the premium look; two balanced lines is normal.
- Avoid a cut that strands one short word on the second line. The renderer binds the last two words, but write so it does not have to fight.
- A claim or an image, not a topic label. "Your agent trusts the wrong things" beats "AI agent security".
- Make `highlight` the phrase that carries the weight, usually the last two to four words.

## deck

The standfirst under the headline, one sentence, plain stakes. The article's subtitle already exists on LinkedIn below the cover, so the deck must not duplicate it verbatim; give the sharper, shorter cousin. It renders at 38px on a 1200px measure.

- The 1200px measure at 38px holds roughly 62 characters per line. Target either up to about 58 characters (one clean line) or 92 to 122 characters (two lines with a substantial second line). The dead zone around 62 to 90 characters strands a stub second line. Never three lines (hard fail); a second line under 40% width is also a fail. Character count is a guide; the render is the truth.
- The deck is optional. An empty deck (`""`) is legitimate when the headline alone is stronger; the layout closes up cleanly.

## image_prompt

A prompt for GPT Image 2 producing the editorial background at 1920x1080. The banner overlays text on the LEFT; the image carries mood on the RIGHT. This spatial split is the whole game, and it is the one thing that differs structurally from the news card (which stacks text at the bottom). The base grade and palette are the same brand rules as `generation.md`; restated here mapped to the wide frame:

- **Composition is right-weighted.** Place the subject and all visual interest right of center, ideally on the right third line. The left 55% of the frame must fall into deep, calm negative space: shadow, gradient, fog, empty architecture, out-of-focus darkness. Say this explicitly in the prompt, e.g. "subject on the right third, left half of the frame falls into deep navy shadow and clean negative space".
- **Nothing busy in the left half or the bottom-left quadrant.** That is where the headline, deck, and footer sit over a left-heavy scrim. Fine texture is fine; edges, faces, bright shapes, and high-frequency detail are not.
- **Keep the extreme top and bottom edges quiet.** Feed previews crop the 16:9 cover tighter (roughly 1.91:1), shaving the top and bottom. Compose the subject's core inside the middle 90% of the height.
- **Brand grade.** Deep navy near #060a12, cold cyan ambient light. Then one contained complementary warm accent, amber-orange opposite cyan: a rim light, a kicker, a motivated practical (a lamp, a sliver of golden hour, a sodium glow). Place the warm accent in the RIGHT third so it pulls the eye away from the text and gives the banner its depth. One source, a little warm specular bokeh, never a flood.
- **Photography language.** Editorial or documentary, large-format feel, shallow depth, fine grain, wide 16:9 cinematic frame. Moody, intelligent, restrained; Apple-keynote-wallpaper polish. Never stock-photo cheerful, never a literal illustration of the concept.
- **Subject matches the article without being on the nose.** Same instinct as news: a trust story suits a lone figure lit by a screen; an infrastructure story suits scale and repetition; a craft story suits hands and tools.
- End with: "Wide 16:9 cinematic composition. No text, no logos, no watermarks, no readable writing."

## Output

Return strict JSON, nothing else, no fences:

```json
{
  "slug": "same-slug-as-input",
  "sources": ["https://..."],
  "variations": [
    {
      "category": "INSIGHT",
      "kicker": "ARTICLE",
      "headline": "Your agent trusts the wrong things",
      "highlight": "the wrong things",
      "deck": "Prompt injection is not a bug you patch. It is the cost of giving a text model hands.",
      "image_prompt": "Editorial tech-noir photography, wide 16:9 ... subject on the right third, left half falls into deep navy shadow and clean negative space ... single warm amber rim light on the right ... Wide 16:9 cinematic composition. No text, no logos, no watermarks, no readable writing."
    }
  ]
}
```

Exactly two variations. `sources` carries any URLs the article leans on (may be empty for a pure opinion piece; when the article asserts external facts, they trace here and into meta.json, same anti-fabrication floor as news). The orchestrator maps these into `banners.json`, `prompts.json`, and the delivery `meta.json`.

The render is the source of truth for fit: `renderer/article.mjs` prints `h=<lines>L@<size>px d=<lines>L/<fill>%` per banner and flags `[fit FAIL]`. Never ship a banner the renderer flags.
