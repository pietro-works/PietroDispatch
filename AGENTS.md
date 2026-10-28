# AGENTS.md — pietro-dispatch

Agent-facing index for this repo. Product docs live in `MASTERPLAN.md`; per-module sequences in `.claude/skills/*/SKILL.md`; artifact specs in `prompts/`. This file holds the PACS registry: the load-bearing couplings where one edit forces a matching edit somewhere non-obvious and missing it fails silently. Protocol: [PACS SPEC.md](../PACS/SPEC.md).

> **Output signal — read this.** Whenever you consult this registry while producing a response, put `P.A.C.S ✅` on its own line at the very top of that response, before anything else. Only print it when you genuinely consulted the registry for that output; a checkmark you did not earn makes the signal a lie.

> **`sync_with` is a floor, not a ceiling.** Every entry below lists the touch-points somebody already found. It is not the complete set. Before you finish a change, grep for the sites the entry does not name, and when you find one, add it to that entry in the same change. An entry that names four sites does not mean there are only four.

## PACS Registry

```yaml
PACS0001:
  anchor: "pipeline/archive-to-dispatch-posts.mjs:detectType"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "tools/scan-assets.mjs"
    - "../pietro-enterprise/registry/contracts/validate-contract.mjs"
    - "../pietro-enterprise/registry/modules.json"
    - "../pietro-enterprise/registry/contracts/news.contract.md"
    - "../pietro-enterprise/registry/contracts/slides.contract.md"
    - "../pietro-enterprise/registry/contracts/article.contract.md"
    - "../pietro-enterprise/registry/contracts/fluxogram.contract.md"
    - "../pietro-enterprise/registry/contracts/tutorial.contract.md"
  fails_silently: "Studio's scanner skips the delivery, or the validator classifies it as the wrong type and fails it against another type's contract; the asset never enters the queue and nothing errors"
  justification: "five independent sites key off the same delivery type and none is derived from the others, so a type wired into four of them looks finished while its assets silently never reach the queue"
  kind: "registry"
  notes: "slides, article, fluxogram and tutorial folders all share the <DATE>-<slug> name and are told apart only by contents (slides.pdf, banner-1.png, fluxogram.png, tutorial.png). Any new type on that name shape must extend the content sniff in BOTH validate-contract.mjs and detectType. Tutorial fully wired 2026-07-21."

PACS0002:
  anchor: "renderer/fluxogram.html:HEADLESS"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "renderer/fluxogram.mjs"
  fails_silently: "fluxogram.mjs screenshots editor chrome or a shifted #diagram, or a renderFluxo change silently alters every delivered PNG"
  justification: "one file is both the screenshot surface and an interactive editor, so any editor DOM that escapes the headless gate is painted into every delivered fluxogram"
  kind: "determinism"
  notes: "The gate returns before any editor DOM is built when ?headless is set, window.__FLUXO is present, navigator.webdriver is true, or the UA is HeadlessChrome. Editor chrome (#ed-*, body.ed-on) must stay OUTSIDE #diagram. Keep renderFluxo, the G glyph map and DEFAULT behavior-identical for a given spec; arr/arrColor default to the original output when absent. Widening the gate, adding a render entrypoint, or moving #diagram means re-verifying the default render is byte-identical."

PACS0003:
  anchor: "pipeline/archive-to-dispatch-posts.mjs:claimIndex"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "tools/studio-server.mjs"
    - ".claude/skills/slides/SKILL.md"
    - ".claude/skills/dispatch/SKILL.md"
  fails_silently: "a second same-day run overwrites the first run's raw backgrounds in shared staging, or two archivers claim the same NNN and one silently overwrites the other's archived post"
  justification: "staging paths live in prose inside the skills while index numbers are minted by two independent scripts, so nothing mechanically forces a new module or a second minting authority to respect either rule"
  kind: "convention"
  notes: "Two halves. (1) Staging must be unique per deliverable, work/<module>-<DATE>-<slug>/, never date-only; positional bg-<id>.png filenames collide otherwise. This is how slides deck 007 lost its backgrounds on 2026-07-16. (2) dispatch-posts numbers must be claimed through claimIndex (O_EXCL .lock), never a private scan-max; studio-server's renderKind is the second authority."

PACS0004:
  anchor: "pipeline/generate-images.mjs:writeBg"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "pipeline/archive-to-dispatch-posts.mjs"
    - "../pietro-enterprise/registry/contracts/validate-contract.mjs"
    - "../pietro-enterprise/registry/contracts/slides.contract.md"
    - "../pietro-enterprise/registry/contracts/news.contract.md"
    - "../pietro-enterprise/registry/contracts/article.contract.md"
    - "../pietro-enterprise/registry/contracts/fluxogram.contract.md"
    - "../pietro-enterprise/registry/contracts/tutorial.contract.md"
    - ".claude/skills/slides/SKILL.md"
    - ".claude/skills/dispatch/SKILL.md"
    - ".claude/skills/article/SKILL.md"
  fails_silently: "a deck's raw backgrounds exist only in staging, so reusing or wiping that folder loses them for good and the deck can never be re-rendered; discovered only when someone tries"
  justification: "GPT Image 2 cannot reproduce a background identically, so a background that reaches only staging is a single-copy artifact whose absence no check ever reports"
  kind: "convention"
  notes: "A raw generative source (bg-*.png, or a fluxogram/tutorial render spec) must be delivered into the queue folder AND archived into dispatch-posts. writeBg additionally snapshots an existing bg to bg-<id>.old-<stamp>.png before rewrite; --force overwrites in place."

PACS0005:
  anchor: "tools/atomic-json.mjs:writeJsonAtomic"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "tools/studio-server.mjs"
    - "tools/scan-assets.mjs"
    - "tools/dashboard-data.mjs"
    - "tools/publish.mjs"
  fails_silently: "a concurrent reader loads a truncated plan.json or assets.json and sees a partial or invalid queue"
  justification: "plan.json and assets.json are read by Studio, dashboard-data and publish while another process rewrites them, and a plain writeFile leaves a window where the file on disk is incomplete"
  kind: "determinism"
  notes: "studio-server and scan-assets are the writers; dashboard-data and publish are readers today. Any NEW write path to db/*.json must go through writeJsonAtomic (tmp+rename), never writeFile in place."

PACS0006:
  anchor: "pipeline/archive-to-dispatch-posts.mjs:archiveOne"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "tools/scan-assets.mjs"
  fails_silently: "re-archiving a delivery mints a duplicate under a new number, or the slides LinkedIn document title loses its #NNN"
  justification: "the archive writes meta.number and scan-assets reads that same field to build the document title, so producer and consumer are coupled through a key neither side validates"
  kind: "message-contract"
  notes: "On first archive the assigned number is stamped into the delivery meta.json; a re-archive reuses it and overwrites <prefix>-NNN.* in place. scan-assets reads meta.number for the title Pietro.works IN_THE_LOOP.MD #NNN."

PACS0007:
  anchor: "tools/publish.mjs:withCalendarLock"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "tools/studio-server.mjs"
    - "tools/slot-engine.mjs"
    - "tools/dashboard-data.mjs"
  fails_silently: "a CLI publish and a Studio apply-plan interleave calendar writes, losing bookings or double-scheduling the same asset on LinkedIn"
  justification: "two independent entrypoints write db/calendar.json and the LinkedIn side effect happens before the write, so an interleaved run can post the same asset twice with nothing reporting an error"
  kind: "convention"
  notes: "The schedule loop holds an exclusive calendar.json.lock and re-reads the calendar before each post, skipping any asset another run already scheduled. tools/publish.mjs and tools/linkedin-core.mjs are deliberately untracked (held out of the public repo); the invariant still applies locally."

PACS0008:
  anchor: "renderer/news.mjs:suppressEditorChrome"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "renderer/article.mjs"
    - "renderer/news.html"
    - "renderer/article.html"
  fails_silently: "every delivered news card and article banner carries a pale hairline and a bright grab-handle pill across its bottom edge; the render succeeds, the dimensions validate and both gates pass on shape"
  justification: "the .dock is static body markup so the headless JS gate never sees it, and a clipped captureScreenshot paints the 14px sliver the fixed-position transform leaves inside the viewport"
  kind: "determinism"
  notes: "Editor chrome that is STATIC markup must be suppressed by the render driver. news.html and article.html carry .dock as static <body> markup, unlike slides.html #sed-bar and fluxogram.html #ed-bar which the headless-gated editor IIFE builds and so never exist on a render. Verify by measuring: the bottom 28 device rows of a 2160 news card must show no full-width hairline and no bright centered pill. It shipped once: news-038 through news-049 carried the bar after the 2026-07-22 studio-uniform pass changed the transform from translateY(100%). renderer/tutorial.html carries an identically shaped .dock but tutorial.mjs is IMMUNE because it exports via htmlToImage.toCanvas(#tut), a subtree serialization that never includes the fixed-position sibling; if tutorial.mjs is ever moved to a clipped captureScreenshot, it joins this entry."

PACS0009:
  anchor: "tools/scan-assets.mjs:scanQuotes"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "../pietro.works/gen/quote/linkedin-schedule/queue.tsv"
    - "../pietro.works/gen/quote/linkedin-posts.md"
    - "../pietro.works/gen/quote/quotes.tsv"
    - "tools/publish.mjs"
    - "db/slots.json"
  fails_silently: "an already-posted quote re-enters the schedulable queue and is posted twice, or a pending quote silently drops out of assets.json because its caption heading no longer parses"
  justification: "scanQuotes takes posted-state from the legacy quote scheduler's queue.tsv (status scheduled|skipped = live) and captions from linkedin-posts.md '## Post NNN' headings, two files owned by a tool Studio no longer runs, with no check that either still means what the scanner assumes"
  kind: "message-contract"
  notes: "Quotes are a flat library (assets/linkedin-images-2160/pietro-quote-NNN.png), not a delivery folder, so they sit outside PACS0001's detectType/validate-contract/modules.json sites. Only status 'pending' rows become assets; 001-045 are posted. Once Studio books a quote in calendar.json, publish.mjs' live-booking check is the second guard against a double post. Schedule via apply-plan into explicit slots; slots.json has no managed quote pool by design (even-quote is managed:false)."

PACS0010:
  anchor: "renderer/tutorial.mjs:inject"
  sync_with:              # KNOWN sites, not exhaustive — grep for more before you finish
    - "prompts/GENERATORS.md"
    - "renderer/news.mjs"
    - "renderer/article.mjs"
    - "renderer/slides.mjs"
    - "renderer/fluxogram.mjs"
    - ".claude/skills/tutorial/SKILL.md"
    - "../pietro-enterprise/skills/pipeline/SKILL.md"
  fails_silently: "a renderer gains or loses a spec field, glyph, connector or fit rule and the capability map keeps describing the old toolbox, so every future post is designed from a stale or incomplete list and the new lever is never used"
  justification: "the map is prose read by the model at the start of each pipeline, no renderer or test reads it, so nothing fails when a renderer and the map drift apart"
  kind: "convention"
  notes: "prompts/GENERATORS.md is Step 0 of the dispatch, slides, fluxogram, article and tutorial skills. Any change to a driver's spec (renderer/*.mjs), a template's lever (renderer/*.html: glyph map G, connector types, fit gates), or a Studio RENDER_KINDS entry updates GENERATORS.md in the same change. tutorial.mjs hConn, vConn and tf were added 2026-10-28 with the default render verified byte-identical (md5 before and after)."
```

Numbering: `0001` to `0099` are code-enforced invariants and carry a `PACS####` tag at the anchor; `0100`+ are process rules that live in prose with no anchor. Append-only: never reuse or renumber, and retire a dead entry with `retired: true` rather than deleting it. Run `pacs check` to verify registry health.
