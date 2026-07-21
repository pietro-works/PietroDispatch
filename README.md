<div align="center">

![Pietro Dispatch](docs/assets/hero.webp)

`pietro.works` · automated editorial pipeline

![node](https://img.shields.io/badge/node-20+-0e1525?style=flat-square&labelColor=060a12)
![illustrate](https://img.shields.io/badge/illustrate-GPT_Image_2-0e1525?style=flat-square&labelColor=060a12)
![render](https://img.shields.io/badge/render-headless_Chrome-0e1525?style=flat-square&labelColor=060a12)
![output](https://img.shields.io/badge/output-2160²_PNG-0e1525?style=flat-square&labelColor=060a12)

</div>

## What this is

A small machine that does a full editorial job end to end. Each run reads the day's AI news, picks three stories worth posting, writes each twice in the Pietro.works voice, paints a background per variation, and renders the cards at 2160 square. Output lands in a dated folder, ready to post.

It answers one question: how fast can one person move once the design system, voice, and rendering are specified tightly enough for a model to run unsupervised. The answer was most of a daily content operation, built in an afternoon.

Nothing here is a mockup. The cards below, the header, and the diagram all came out of the pipeline, drawn by the same headless browser that renders the cards.

## The work

<div align="center">

<table>
<tr>
<td><img src="docs/assets/gallery/g1.webp" width="270" alt="Prompt injection card, first take"/></td>
<td><img src="docs/assets/gallery/g2.webp" width="270" alt="GPT-5.6 pricing card, first take"/></td>
<td><img src="docs/assets/gallery/g3.webp" width="270" alt="GLM-5.2 card, first take"/></td>
</tr>
<tr>
<td><img src="docs/assets/gallery/g4.webp" width="270" alt="Prompt injection card, second take"/></td>
<td><img src="docs/assets/gallery/g5.webp" width="270" alt="GPT-5.6 pricing card, second take"/></td>
<td><img src="docs/assets/gallery/g6.webp" width="270" alt="GLM-5.2 card, second take"/></td>
</tr>
</table>

</div>

One day's run. Each column is a story, top row a first take, bottom row a second: same news, two editors, your choice. Read across the top for three angles before any topic repeats.

## How it runs

![The pipeline: curate, write, illustrate, render, gate, deliver, with the gate as the measured step](docs/assets/pipeline.webp)

Six moves, one command, laptop closed. The half that matters is not the generating, it is what refuses to ship. Every stage carries a check, and a card that fails one gets held.

**Curate** reads `sources.yaml` and the open web and pulls the strongest candidates in full, so the writing rests on the mechanism, not a headline. A funding round with nothing under it does not make the cut.

**Write** turns each story into two cards, same news but a different hook and cut. The voice is a file, not a vibe: a brand-voice spec plus a humanization pass that strips the machine tells before either card can move.

**Illustrate** sends each background to GPT Image 2, one warm accent on a cold frame.

**Render** exports through headless Chrome at 2160, then measures the result. `measureFit` reads the real rendered card and `--check-fit` hard-fails it on the spot: a headline over two lines, a stubby summary, a lone word stranded on a line. A bad layout stops the run, it does not ship soft. The renderer gets its own section below.

**Gate** is the part I care most about. Two adversarial passes read every card before it is allowed out, one for voice, taste, and grounding, one for contract and dimensions. A fail is a rewrite, not a warning, and the same gate runs across news, slides, and article.

**Deliver** takes only what passed into a dated folder, one subfolder per story, with both backgrounds, both cards, both captions, and the metadata, then uploads.

## The renderer

The card template, `news.html`, is the real brand file used by hand, not a stripped automation copy. The renderer drives it in headless Chrome over the DevTools protocol: it serves the template, sets each card's category, headline, and background through the template's own functions, runs a fit pass, and screenshots the card at exactly 2160 by 2160. Every output is checked against that size before writing, so a bad capture fails loud.

Two edits earn their keep. The headline uses `text-wrap:balance` to even the lines and kill a stranded word, and a guard binds the last two words with a non-breaking space so the final line never collapses to a lone orphan. No human nudges line breaks.

Because it is a real browser rendering real CSS, the cards inherit the brand's gradient accent, the Clash Display headline, the dot-matrix texture, and the scrim.

## The look

The backgrounds follow one rule that does most of the work. Keep the brand's near-black navy and cold cyan, then add a single warm accent from across the color wheel: a rim light, a backlight, a lamp, a sliver of golden hour. Warm advances and cool recedes, so one accent buys depth without busying the frame. Lively, never loud.

Over the photo sits the Pietro.works system: the cyan to green to violet spectrum used as a spotlight not wallpaper, monospace metadata, tinted hairlines, and one glowing accent phrase per card.

## Sliders, the evergreen track

![Sliders](docs/assets/sliders-banner.webp)

Dispatch chases the day. Sliders does the opposite: one durable idea taught as a short LinkedIn carousel, the kind that keeps getting saved months later. The series is `IN_THE_LOOP.MD`, and a run makes a three to five slide deck plus its caption.

It reuses the dispatch image pipeline wholesale, same `gpt-image-2` backgrounds and warm-accent rule, and adds a second renderer, `slides.mjs`, on the same headless Chrome. Slides come in four shapes the deck mixes by fit: a hero with a glyph row, a steps card, a before-and-after split where the renderer desaturates the *before* so the *after* lands in color, and a contact close. It stitches the slides into a square PDF, what LinkedIn wants for a document post. Fonts are self-hosted as woff2 in `renderer/fonts/`, after the CDN versions kept hanging mid-render.

One full `IN_THE_LOOP.MD` deck, on right-sizing your model calls:

<div align="center">

<table>
<tr>
<td><img src="docs/assets/sliders/inloop-01.jpg" width="200" alt="Hero slide: same output, a third of the cost"/></td>
<td><img src="docs/assets/sliders/inloop-02.jpg" width="200" alt="Steps slide: four ways to cut the bill"/></td>
<td><img src="docs/assets/sliders/inloop-03.jpg" width="200" alt="Before and after: one model for everything vs the right model for each job"/></td>
<td><img src="docs/assets/sliders/inloop-04.jpg" width="200" alt="Contact slide: build the private tools your team wishes existed"/></td>
</tr>
</table>

</div>

The deck is also a live component. Open [`docs/sliders-preview.html`](docs/sliders-preview.html) and arrow, swipe, or drag through it. Brand tokens and the gradient accent, no framework, one file you can drop anywhere.

## Article covers, the third track

![Article cover: The Gunas of the Glider](docs/assets/article/cover-001.webp)

The third track makes cover banners for LinkedIn articles. Same brand system, same headless Chrome, but the canvas goes wide, 1920 by 1080, and the layout flips: where the square cards stack text at the bottom, the cover runs it down the left and lets the image carry the right. The one above splits a figure down the middle, cold code on one side, warm stillness on the other. Each run writes two covers for one article, a different metaphor and cut in each, so there is always a real choice.

This track has no schedule, on purpose. A cover gets made when an article is ready and goes up by hand when it publishes.

## Fluxograms, the fourth track

The pipeline diagram near the top of this page is not a drawing. It came out of a fourth generator, the same headless Chrome, pointed at one job: take a durable idea and lay it out as a wide six-step flow. One concept, six cards left to right, a pivot in the middle that carries the whole point. A value line runs along the bottom, and the thing reads in one glance and stays true a year later.

The look is shared. It takes one warm background from a small cold-steel library instead of a fresh GPT Image 2 paint, then lays the brand scrim and gradient accent over it. A spec is a small JSON file, so a fluxogram is re-renderable: change a card, run it again, get a clean 2400 by 822 PNG. Four are out so far, on the eval loop, build versus buy, keeping a human in the loop, and cutting the model bill.

Like article covers, this track stays off the calendar. A fluxogram gets made when an idea is worth teaching, not on a clock.

## Scheduling and the queue

![Pietro Studio](docs/assets/studio.webp)

The two feed tracks never wait for someone to press start. Each runs as a scheduled job on its own cadence, builds the dated folder, and drops it in Drive: dispatch on odd days, sliders on a lighter evergreen rhythm. Article covers stay off the calendar, made on demand.

What comes out flows into a small control room. Studio reads every deck and card into one queue, tags each from unscheduled through scheduled to verified, finds the next open slot, and books the approved onto LinkedIn. A single-page dashboard in the same dark palette as the work, no framework. You pick what ships, the slot engine keeps the calendar.

## Run it yourself

The deterministic half runs from two scripts. Curation and writing are the reasoning layer, and these two turn a staged run into finished cards.

```bash
npm install
export OPENAI_API_KEY=...   # the illustrate step needs it; org verification required for GPT Image 2

# given a staged work/<date>/ with prompts.json and cards.json:
node pipeline/generate-images.mjs --in work/<date>/prompts.json --out work/<date>/backgrounds
node renderer/news.mjs --cards work/<date>/cards.json --root work/<date> --out work/<date>/cards
```

The renderer finds Chrome from `CHROME_BIN` or the usual locations. Fonts load at render time, so there is nothing to install for the type to look right.

## Layout

```
pietro-dispatch/
  prompts/
    PIETRO_WORKS_VOICE.MD     the brand voice spec
    HUMANIZE.md               the anti-machine-tell pass
    curation.md  generation.md          dispatch: pick and write the stories
    slides-curation.md  slides-generation.md   sliders: pick and design the deck
    article-generation.md     article: write the cover
    fluxogram-generation.md   fluxograms: design the flow spec
    slides-sources.yaml       the evergreen scan map
  renderer/
    news.html    news.mjs     dispatch template, 2160 export
    slides.html  slides.mjs   sliders template, 2160 export plus square-PDF stitch
    article.html article.mjs  article cover template, 1920x1080 export
    fluxogram.html fluxogram.mjs  the flow-diagram (fluxogram) renderer, re-renderable
    fonts/                    self-hosted Clash and DM woff2
    *.png/.webp/.avif/.jpg    render-time brand assets
  pipeline/
    generate-images.mjs       GPT Image 2 backgrounds, shared by all three
  .claude/skills/             the dispatch, slides, article, and fluxogram run skills
  sources.yaml                the dispatch source pool
  docs/
    sliders-preview.html      the live, swipeable deck
    assets/                   the images on this page
```

## Status

Both feed generators run on a schedule now, firing locally and delivering to Drive untouched. Article covers and fluxograms stay the deliberate exceptions, made on demand. Built as a study in AI-assisted rapid iteration: encode the taste once, then let the machine do the repetitive part and keep the human on the decision.

---

<div align="center">

<img src="docs/assets/pietro.webp" width="132" alt="Pietro Impagliazzo"/>

**Pietro Impagliazzo** · AI Workflow Architect

[pietro.works](https://pietro.works) · [linkedin.com/in/pietro-works](https://linkedin.com/in/pietro-works)

Designed, written, and rendered for Pietro<sup>.works</sup>.<br>
The brand system is proprietary, the pipeline is shared as a reference build.

</div>
