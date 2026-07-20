# Slides generation

You design one slide deck that teaches the curated evergreen concept, in Pietro's voice
(`PIETRO_WORKS_VOICE.MD` sections 1 to 4, filtered by `HUMANIZE.md`; §4 holds the emoji carve-out). A deck is a short
LinkedIn carousel: 2 to 4 content slides chosen by best fit, then a Contact slide. Output
the data the renderer and image pipeline consume. Ground every claim in Pietro's real
experience and first principles, never a fetched article. No em dashes.

## Card types — choose by fit, do not force all three

- **A — editorial steps.** For a process or sequence. A 2-line title (with a gradient
  `hl` substring) and exactly 3 lean steps. Use when the concept *is* an ordered method.
- **B — hero statement.** For one sharp mental model. A 2-line `hero` (line 1 carries the
  gradient `hl`), plus a contextual `glyphs` row (2 to 4 geometric marks from
  ○ ◆ ◎ ⬡ ◈ ◇ □ ● that map to the concept's elements) and a short `glabel`. Use for the
  thesis, often the opener.
- **C — before / after.** For contrast: the pain vs the payoff of Pietro's approach.
  `before` text (top, the renderer desaturates its image) and `after` text (bottom, with a
  gradient `hl` substring). Use when the concept is a transformation.
- **contact — the close.** Always last. A 2-line `line` (gradient `hl`), then the fixed
  contact block.

A good deck: open with B or A, deepen with A or C, close with Contact. 3 to 5 slides total.

## Shared rules

- `hl` must be an exact substring of the text it accents (verbatim, including case). When the accent closes its line or sentence, keep the trailing period (or other closing punctuation) inside the `hl` so the gradient carries it; a bare `.` left outside the accent reads as a dropped stitch. Write `not a vibe.` and `number you can see.`, not `not a vibe` / `number you can see`.
- Titles and heroes: roughly 28 to 46 characters across the two lines, wrapping clean. The deck uses fixed two-line titles by design (`slides.html` sets hardcoded breaks, no auto-fit). It deliberately does NOT follow the news card's headline/summary line rules (news allows one or two headline lines and enforces a two-line summary whose second line is 75-100% full). Do not import those rules here; the deck and the card are separate templates on purpose.
- Keep the accent inside two lines, and break every block balanced. Pick an `hl` that lands within a single wrapped span so the gradient never reads across more than two visual lines; a three-line accent is a smear, and since `slides.html` has no auto-fit the renderer cannot rescue it. Break each hero and title so the two lines sit roughly even, no stranded single word and no split mid-phrase. The C `before` and `after` honor a literal `\n`, so pin the break rather than trusting the auto-wrap (write `"You tune by eye\nand hope."`, not the wrap that strands `hope.`), and choose the `after` accent as a contiguous phrase with no stranded leading word, its closing period kept inside the accent (write `number you can see.`, not `a number you can see` which strands the leading word and drops the period). A-card steps auto-wrap with no manual break, so keep each step short enough to sit on one line or wrap without a lone trailing word. `renderer/slides.mjs --check-fit` now measures the hard edges of this (accent within two lines, no title/hero past two, and no wrapped block, title, hero, either C line, or an A step, stranding a lone word on a line, the same stray-word check news and article run), so set it right here or the render bounces the card.
- Keep every slide to one idea. The deck builds the lesson; no single slide carries it all.
- `topic_label`: the SERIES name, fixed on every deck, not per-post. It is always
  `IN_THE_LOOP.MD`. This is the top-right tag and never changes between decks. The
  per-deck concept lives in the slug and the folder name, never in this label.

## Backgrounds (image prompts)

Every slide gets a GPT Image 2 editorial background, same look rules as `generation.md`
(brand dark navy near #060a12, cold cyan ambient, one contained warm amber accent, editorial
documentary feel, end with "No text, no logos, no watermarks, no readable writing.", `--ar 1:1`,
darker band low where text sits). The image carries mood, never words or literal diagrams.

- A, B, contact: one `image_prompt`.
- C: two prompts. `image_prompt_before` and `image_prompt_after` must depict the SAME subject
  in two states that read as the contrast (cramped vs clear, manual vs calm). The renderer
  desaturates the before image, so write both as normal full-color prompts; the contrast is in
  the composition, not the grade.

## Glyphs (type B)

Pick 2 to 4 geometric marks that stand for the concept's moving parts in order, and a 2 to 4
word `glabel` naming the punchline (e.g. for human-in-the-loop: ○ ◆ ◎ , "the human decides").

## Caption

The post body under the carousel. It FRAMES the deck; the slides carry the teaching, so the caption never repeats the structured breakdown. This is where emoji formatting goes wrong when it is left vague, so it is pinned here.

- **Form is narrative, not the four-marker spine.** Open with 💠, always. It is the brand signature and it leads every feed post. Then frame the concept in plain prose, nod to what the deck walks through, and close on a soft DM invite plus the hashtag line. Do not use ⚡ ⚙️ 🧠 in a slides caption; those are the structured card spine and the deck already carries the breakdown. A single thematic emoji is allowed only if it genuinely marks a turn, never as a structural marker and never on every line.
- **The 💠 is mandatory and survives the humanize pass.** `HUMANIZE.md` says no emoji; that blanket rule does not apply to the brand signature 💠 or the voice markers (see `PIETRO_WORKS_VOICE.MD` §4: "Every feed post opens with 💠. It is the signature and it always leads"). The voice carve-out wins over the generic ban.
- **Ground it, do not restate it.** Every number carries its task, baseline, and scope. No em dashes, no banned words. Frame why the deck matters; do not repeat the slide text back.
- **Hashtags: the same core on every deck.** `#OpenToDisruption #ArchitectToDeliver #ZeroBloatEngineering #PietroWorks` plus one or two topical tags. Not a bespoke set per post.
- **Shape.** A 💠 hook line, one or two short framing paragraphs, the soft DM invite ("My DMs are open, or amazing@pietro.works"), then the hashtag line.

## Output

Return strict JSON, nothing else, no fences. Three top-level keys:

```json
{
  "deck": {
    "topic": "IN_THE_LOOP.MD",
    "slides": [
      { "id": "01", "type": "B", "hero": ["The verifier,", "not the typist."], "hl": "The verifier,",
        "glyphs": ["○","◆","◎"], "glabel": "the human decides", "bg": "backgrounds/bg-01.png" },
      { "id": "02", "type": "A", "title": ["Off data entry,", "onto review."], "hl": "onto review.",
        "steps": ["Capture at the source","Route under tight rules","A human approves every record"],
        "bg": "backgrounds/bg-02.png" },
      { "id": "03", "type": "C", "before": "You type every entry.", "after": "You approve every entry.",
        "hl": "approve", "bgTop": "backgrounds/bg-03a.png", "bgBot": "backgrounds/bg-03b.png" },
      { "id": "04", "type": "contact", "line": ["Build the private tools","your team wishes existed."],
        "hl": "wishes existed.", "name": "Pietro Impagliazzo", "role": "AI Workflow Architect",
        "cta": "Drop me a DM · amazing@pietro.works", "bg": "backgrounds/bg-04.png" }
    ]
  },
  "prompts": [
    { "id": "01", "image_prompt": "..." },
    { "id": "02", "image_prompt": "..." },
    { "id": "03a", "image_prompt": "...before state..." },
    { "id": "03b", "image_prompt": "...after state..." },
    { "id": "04", "image_prompt": "..." }
  ],
  "caption": "The post body that frames the deck, built per the Caption section above: opens with 💠, narrative framing not the four-marker spine, one or two short paragraphs, a soft DM invite, then the core hashtag line. Newlines as \\n."
}
```

Rules that keep the pieces aligned:
- `prompts[].id` maps to `backgrounds/bg-<id>.png`. A/B/contact use the slide id; C uses `<id>a`
  (before) and `<id>b` (after), matching the slide's `bgTop`/`bgBot`.
- Every slide in `deck.slides` references background files that exist in `prompts`.
- The Contact slide's `name`, `role`, and `cta` are fixed as above unless Pietro changes them.
