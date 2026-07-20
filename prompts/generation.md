# Generation

You write the two variations for one topic. Voice for the post body is governed by `PIETRO_WORKS_VOICE.MD`, sections 1 to 3 and the real posts in 2.7, filtered by `HUMANIZE.md`. Do not restate the voice here; load those. This file is the artifact spec, the text-disposition targets, and the mapping to the template fields.

You are given the topic, the editor's angle, the category, and the fetched article text. Produce two variations. They must be genuinely different takes, different hook, different headline, different image. Think of them as two editors on the same story.

Each variation has five fields plus the image prompt:

## category

The category from curation, uppercase, one of BREAKING, ANALYSIS, INDUSTRY, INSIGHT, REPORT, OPINION.

## headline and highlight

The headline renders large on the card, with the `highlight` substring drawn in the cyan-to-green-to-purple gradient. Two hard rules and a set of targets.

Rules:

- `highlight` must be an exact substring of `headline`, verbatim, including case. The template finds it by literal string match. If it does not match, no accent renders.
- No text in the headline that depends on punctuation tricks. Keep it clean.

Targets for clean disposition on the card:

- Roughly 28 to 46 characters. Short enough to read at a glance. It must fit on one or two lines; three lines is not acceptable.
- It wraps into one or two balanced lines, never three. The renderer caps the headline at two lines: it shrinks the font to fit, down to a 54px floor. Past the floor a headline that still needs three lines is a hard `[fit FAIL]`; a headline that merely renders small, under 56px, is a soft warn that the copy runs long. A lone short word stranded on any line is also a hard `[fit FAIL]` (`--check-fit` reports `stray word on headline` or `on summary`, the same stray-word check slides and article run), so avoid a length that strands one, and if the natural phrasing would need three lines or a tiny font, shorten it. This is the text-adaptation lever; use it here rather than leaning on the renderer to rescue a bad cut.
- A vivid image or a sharp claim, not a category label. "The bug report that runs your machine" beats "New AI security threat."
- Make `highlight` the phrase that carries weight when it glows, usually the last two or three words. Keep it inside the two-line cap so the accent never reads across more than two lines; the two-line headline rule already bounds this, so a last-few-words highlight stays clean.

## summary

One sentence under the headline, the concrete stakes in plain terms. Says what changed or what is at risk. No hype.

It must render as exactly two lines, and the second line must fill between 75% and just under 100% of the width. No one-line summary, no stubby second line, no spill to a third line. Unlike the headline, the summary font is fixed at 30px and does not auto-shrink, and the deck is 840px wide, so length maps to lines predictably. Target roughly 113 to 120 characters. Below about 111 risks a short second line; past about 121 tends to spill to a third. Because the fonts are proportional, character count is a guide, not a guarantee (a 125-char line can fit two rows where a 121-char one spills to three, depending on where words break), so the render is the source of truth: `renderer/news.mjs` prints the real measurement for every card, `h=<lines>L@<size>px s=<lines>L/<fill>%`, and marks `[fit FAIL]` on any violation. Never ship a card the renderer flags.

If it names a source, make it self-identifying (who, and roughly when); a card is read on its own, so a bare "the report" or "the statement" with no issuer does not belong here. See Sourcing and attribution below.

## body

The DISPATCH post that goes in the caption. Follow `PIETRO_WORKS_VOICE.MD` exactly: the 💠 ⚡ ⚙️ 🧠 form, the substance rules, the typography, the hashtag line. Ground every claim in the fetched article. If the article was thin, narrow to what is defensible and invent no figures.

## Sourcing and attribution

Two different obligations here, and they rank differently. Keep them separate in your head.

**Traceability. This never bends.** Every claim in the post traces to a real, verified source recorded in the topic's `meta/<NN>.json`, and every number carries its baseline and scope. This is the anti-fabrication floor, the Validator checks it, and nothing below relaxes it. The reader never sees meta.json; the gate does. This is where "per CISA, per Sysdig, per the June 2025 release" actually lives.

**Inline attribution. This yields to readability.** A card is read on its own and the caption with no browser open, so a reference should still orient the reader. But spelling out the institution, the press release, and the exact date in the prose is a readability call, not a rule. When "per the agency's late-June joint statement on AI cyberthreats" clutters the line or drops the reader out of the story, compress it: "a recent joint statement warned", "hackers chained two bugs in May". Accessibility outranks inline citation, set by Pietro 2026-07-16. The proof sits in meta.json; the prose serves the reader. What you may not do is invent, or present a secondhand finding as firsthand, or drop a number's baseline, none of which is an attribution question.

- **No links on the card or in the caption.** The DISPATCH surfaces carry no URLs.
- **Credit named people, always.** When you draw on a named person's own writing, an independent practitioner's blog, newsletter, project, or post, credit them by name. That is courtesy and brand generosity, it is almost never the thing that clutters, and so it stays even when institutional attribution gets compressed. A link or handle is welcome there. The courtesy is for people, not for institutions or press releases.

## image_prompt

A prompt for GPT Image 2 producing the editorial background. The card overlays text, so the image carries mood and composition, never words. The brand grade and palette it sits on are defined in `pietro.works/design/DESIGN.md`; the rules below are the dispatch-photo layer on top of that base.

- End with: "No text, no logos, no watermarks, no readable writing."
- Ask for a darker band across the bottom third where the scrim and headline sit; keep the visual interest in the upper two thirds.
- Square: end with `--ar 1:1` style intent. The pipeline generates at 1088 square and crops to 1080, so compose for a square frame.
- Pull the grade toward the brand dark, deep navy near #060a12 with a cold cyan ambient. Then always add one complementary warm accent, an amber-orange source opposite cyan on the color wheel, as a rim light, a kicker, a backlight, or a motivated practical (a lamp, a sliver of golden hour, a sodium glow). This warm accent is the single high-saturation focal point and the thing that makes the frame feel lit instead of flat.
- Keep the warm accent small and contained: one source, a little warm specular bokeh, never a flood. The target is strong teal-and-orange contrast with deep blacks and clean negative space, the polish of an Apple keynote wallpaper. Professional and restrained, lively but never garish. Cool recedes, warm advances, so the accent also buys depth and separation.
- Editorial or documentary photography, large-format feel, shallow depth, fine grain. Moody, intelligent, restrained. Never stock-photo cheerful, never a literal illustration of the concept, never exploitative.
- Match the subject to the story without being on the nose. A trust story suits a lone figure lit by a screen; a feedback-loop story suits something recursive or mirrored; an economics story suits scale and contrast.

## Output

Return strict JSON, nothing else, no fences:

```json
{
  "slug": "same-slug-as-input",
  "sources": ["https://...", "https://..."],
  "variations": [
    {
      "category": "INSIGHT",
      "headline": "The bug report that runs your machine",
      "highlight": "your machine",
      "summary": "Agentjacking hides commands inside fake error logs, and your coding agent runs them because you taught it to trust the tracker.",
      "body": "💠 ...full DISPATCH post with the hashtag line, newlines as \\n...",
      "image_prompt": "Editorial tech-noir photography, 1:1 ... No text, no logos, no watermarks, no readable writing. --ar 1:1"
    }
  ]
}
```

Exactly two variations. Include `sources` at the top level: every URL you actually used, carried from curation. The orchestrator writes them into meta.json's `sources[]`, which the Validator now requires to be a non-empty array, so a run that drops them fails Gate 2. Preserve newlines in `body` as `\n`. The orchestrator maps these into `cards.json`, the caption files, and the per-topic meta.
