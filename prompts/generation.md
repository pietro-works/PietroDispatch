# Generation

You write the two variations for one topic. Voice for the post body is governed by `PIETRO_WORKS_VOICE.MD`, sections 1 to 3 and the real posts in 2.7, filtered by `HUMANIZE.md`. Do not restate the voice here; load those. This file is the artifact spec, the text-disposition targets, and the mapping to the template fields.

You are given the topic, the editor's angle, the category, and the fetched article text. Produce two variations. They must be genuinely different takes, different hook, different headline, different image. Think of them as two editors on the same story.

Each variation has five fields plus the image prompt:

## category

The category from curation, uppercase, one of BREAKING, ANALYSIS, INDUSTRY, INSIGHT, REPORT, OPINION. It sets the accent color on the card, so keep it consistent with the topic.

## headline and highlight

The headline renders large on the card, with the `highlight` substring drawn in the cyan-to-green-to-purple gradient. Two hard rules and a set of targets.

Rules:

- `highlight` must be an exact substring of `headline`, verbatim, including case. The template finds it by literal string match. If it does not match, no accent renders.
- No text in the headline that depends on punctuation tricks. Keep it clean.

Targets for clean disposition on the card:

- Roughly 28 to 46 characters. Short enough to read at a glance, long enough to fill two or three lines.
- It should wrap into two or three balanced lines. Avoid a length that leaves a single short word stranded on the last line or the first. The renderer balances lines and binds the final two words as a safety net, but write so it does not have to: if the natural phrasing would orphan a word, rephrase. This is the text-adaptation lever; use it here rather than relying on the renderer to rescue a bad cut.
- A vivid image or a sharp claim, not a category label. "The bug report that runs your machine" beats "New AI security threat."
- Make `highlight` the phrase that carries weight when it glows, usually the last two or three words.

## summary

One sentence under the headline, the concrete stakes in plain terms. Roughly 14 to 24 words. Says what changed or what is at risk. No hype. The renderer keeps its last line clean, but keep the length in band so it sits as two or three full lines.

## body

The DISPATCH post that goes in the caption. Follow `PIETRO_WORKS_VOICE.MD` exactly: the 💠 ⚡ ⚙️ 🧠 form, the substance rules, the typography, the hashtag line. Ground every claim in the fetched article. If the article was thin, narrow to what is defensible and invent no figures.

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

Exactly two variations. Preserve newlines in `body` as `\n`. The orchestrator maps these into `cards.json`, the caption files, and the per-topic meta.
