# PROMPT-DB.md

A working library of GPT Image 2 background prompts in the Pietro.works look. Grounded in the same grade rules as `prompts/generation.md`, `prompts/article-generation.md`, and `pietro.works/design/DESIGN.md`. Everything here is a background: mood and composition, never words. Text is overlaid at render time.

Model: `gpt-image-2`. These feed the existing pipeline unchanged.

---

## How to use

Every entry is a **subject line** plus a **base tag** and an **aspect**. Assemble the final prompt like this:

```
<SUBJECT>. <BASE>. <CLOSER>
```

Drop the assembled string into `prompts.json` and run the pipeline:

```json
[{ "id": "TEC-01", "image_prompt": "<assembled prompt>" }]
```

```
node pipeline/generate-images.mjs --in work/<date>/prompts.json --out work/<date>/backgrounds --format square   # or --format wide
```

Sizes are fixed by the pipeline: `square` generates 1088² and crops to 1080² (news, slides); `wide` generates 1920×1088 and crops to 1920×1080 (article banners, hero, fluxogram). Compose for the crop.

---

## The two accent modes

Both are brand. Pick per image.

**`[E]` Editorial (teal + warm amber).** The dispatch photo layer. Deep navy near `#060a12`, cold cyan ambient, then one small contained warm amber source (a rim, a kicker, a motivated practical, a lamp, a sliver of golden hour, a sodium glow). Teal-and-orange contrast with deep blacks and clean negative space. This is the default for card, slide, and article backgrounds. It reads as a photograph.

**`[S]` Spectrum (cyan → green → violet).** The core brand accent used as a luminous sweep on black glass, spotlight not wallpaper. This is the hero look (it is what generated `bg-spectrum-sweep.png`). Use it for brand banners, hero art, and the more abstract, non-photographic pieces.

### Base strings

Paste one of these after your subject line.

**`[E]` base**
> Deep near-black navy base (#060a12), cold cyan ambient light, one small contained warm amber accent as the single high-saturation focal source, teal-and-orange contrast, deep blacks and clean negative space, editorial documentary photography, large-format feel, shallow depth of field, fine film grain, moody and restrained, Apple-keynote-wallpaper polish.

**`[S]` base**
> Very dark near-black deep navy base (#060a12), a single luminous spectrum sweep, electric cyan into neon green into violet purple, used as a spotlight not wallpaper, soft bokeh highlights, fine film grain, vast negative space, deep blacks, engineered and restrained, cinematic and minimal.

### Closers (mandatory, aspect-specific)

**`sq` square (news, slides)**
> Darker band across the lower third where the text sits, keep the visual interest in the upper two thirds. Square 1:1 frame. No text, no logos, no watermarks, no readable writing.

**`wide` 16:9 (article, hero, fluxogram)**
> Wide 16:9 cinematic composition, subject weighted to the right third, quiet negative space on the left, calm top and bottom edges. No text, no logos, no watermarks, no readable writing.

---

## Reading an entry

```
**TEC-01 · Server aisle** — <subject line>.  [E · sq · infra, scale]
```

`ID` · short name — the subject line to expand. In brackets: base mode, suggested aspect, and what story it suits. The aspect and mode are suggestions, not locks. Any subject can flip to `[S]` if you want the brand sweep instead of a photograph, and most can go `sq` or `wide`.

**ID scheme:** three-letter category + two digits. Stable. Append, never renumber. Add new ones at the end of a category.

---

## TEC · Tech & systems

Screens, silicon, networks, machines that compute. Match to infrastructure, cost, agents, trust, scale.

**TEC-01 · Server aisle** — a single cold-lit data-center aisle receding into black, one amber status LED glowing on a far rack.  `[E · wide · infra, scale]`
**TEC-02 · Circuit macro** — extreme macro of a dark circuit board, cyan traces catching ambient light, one warm solder joint glinting.  `[E · sq · systems, detail]`
**TEC-03 · Screen-lit face** — a lone figure in shadow lit only by a monitor's cyan glow, a warm desk-lamp kicker on one cheek.  `[E · sq · trust, agents]`
**TEC-04 · Fiber fan** — a bundle of fiber-optic strands fanning into darkness, cold light in the cores, one strand flaring warm at the tip.  `[E · wide · networks, speed]`
**TEC-05 · GPU fins** — the fins of a graphics card in raking light, cold machined metal, a warm power-cable glow behind.  `[E · sq · compute, cost]`
**TEC-06 · Terminal bloom** — heavily out-of-focus code on a dark screen, cyan text bloom, a warm reflection of a lamp in the glass.  `[E · sq · software, dev]`
**TEC-07 · Quiet drone** — a small quadcopter hovering in a black studio void, cyan underglow, a single warm rim light.  `[E · wide · autonomy]`
**TEC-08 · Patch wall** — a wall of network patch cables in cold shadow, one warm-labeled cable catching the light.  `[E · sq · integration, plumbing]`
**TEC-09 · Data ribbon** — a luminous data ribbon arcing across black glass, cyan into green into violet, like a signal made visible.  `[S · wide · hero, brand]`
**TEC-10 · Idle arm** — an industrial robot arm at rest in a dark cell, a cool rim on the steel, a warm hazard lamp low in frame.  `[E · wide · automation, labor]`
**TEC-11 · Sensor grid** — a dark plane of tiny sensors, a cool even wash, one node lit warm and awake.  `[E · sq · monitoring, eval]`
**TEC-12 · Boot glow** — a single motherboard powering up in the dark, faint cyan across the board, one warm capacitor ember.  `[E · sq · systems, startup]`

---

## IND · Industrial & machine

Steel, heat, tooling, engineering at scale. Match to economics, labor, manufacturing, hard problems.

**IND-01 · Foundry pour** — a molten metal pour in a dark foundry, the pour itself the one warm source, cold ambient around it.  `[E · wide · scale, heat]`
**IND-02 · Turbine blades** — a close pass over a jet turbine's blades, cold steel, a warm inspection lamp raking one edge.  `[E · sq · engineering, precision]`
**IND-03 · Warehouse dusk** — a vast empty warehouse, cold blue from high windows, a single warm sodium fixture far down the aisle.  `[E · wide · scale, economics]`
**IND-04 · Gears in oil** — a macro of meshed gears slick with oil, cool reflection, one warm highlight riding a single tooth.  `[E · sq · mechanism, coupling]`
**IND-05 · Welding arc** — a welder's arc as the sole warm-white burst in a black shop, cyan smoke haze drifting through.  `[E · sq · making, craft]`
**IND-06 · Steel beams** — crossing steel girders against a near-black sky, cold rim light, a warm work lamp clamped to one beam.  `[E · wide · structure, build]`
**IND-07 · Control desk** — a dim industrial control desk, rows of cool indicators, one amber alarm lit and alone.  `[E · wide · ops, risk]`
**IND-08 · Conveyor** — an idle conveyor belt receding into shadow, cool overhead wash, a warm bulb over the far station.  `[E · wide · pipeline, throughput]`
**IND-09 · Hydraulic press** — a heavy press in a dark bay, cold steel mass, a warm rim spilling from a side door.  `[E · sq · force, power]`
**IND-10 · Valve stack** — a tangle of industrial pipes and valves, cool metal, one warm pressure gauge glowing.  `[E · sq · systems, pressure]`
**IND-11 · Crane silhouette** — a gantry crane black against cold night haze, one warm cab light high up.  `[E · wide · scale, lift]`
**IND-12 · Lathe curl** — a metal lathe shaving curling off in cool light, one warm spark at the cut.  `[E · sq · precision, craft]`

---

## NAT · Nature & landscape

Terrain, water, weather, the organic. Match to time, growth, decay, forces larger than the topic.

**NAT-01 · Glacier wall** — deep blue ice walls falling into black, a thin warm sunrise sliver along the rim.  `[E · wide · time, cold]`
**NAT-02 · Lava seam** — a dark basalt field cut by a single glowing amber lava seam, cool ash sky above.  `[E · wide · pressure, heat]`
**NAT-03 · Fog forest** — black pines standing in cold fog, one warm distant lantern deep among the trunks.  `[E · sq · mystery, search]`
**NAT-04 · Tide pool** — wet dark rock under cool moonlight sheen, a warm glow pooling in one basin.  `[E · sq · quiet, detail]`
**NAT-05 · Dune crest** — a single sculpted dune edge, cold blue on the shadow side, warm last light on the crest.  `[E · wide · scale, simplicity]`
**NAT-06 · Storm line** — a near-black sea and sky, cool ambient, one warm break of sun on the far waterline.  `[E · wide · uncertainty, horizon]`
**NAT-07 · Cave mouth** — the dark interior of a cave, cool daylight from the opening, a warm fire glow on the near wall.  `[E · sq · threshold, inside-out]`
**NAT-08 · Aurora lake** — a cyan-green-violet aurora ribbon over still black water, mirrored faintly below.  `[S · wide · hero, brand]`
**NAT-09 · Frost macro** — extreme macro of frost crystals, cold cyan cast, a warm low sun catching one blade of grass.  `[E · sq · detail, fragility]`
**NAT-10 · Slot canyon** — a narrow sandstone slot in shadow, cool depth, a warm shaft of light falling down one wall.  `[E · sq · path, constraint]`
**NAT-11 · River bend night** — a dark river bending through cold terrain, one warm cabin light on the bank.  `[E · wide · flow, journey]`
**NAT-12 · Seed macro** — a single dark seed or spore in cool light, a warm rim tracing its edge.  `[E · sq · beginning, growth]`

---

## ABS · Abstract & geometry

Pure form, no literal subject. The most flexible category and the natural home of the spectrum sweep.

**ABS-01 · Spectrum sweep** — a single luminous spectrum arc traced across black glass, cyan into green into violet, the instrument panel of a quiet expensive machine.  `[S · wide · hero, brand]`
**ABS-02 · Folded planes** — soft folded planes of near-black, one warm crease of amber where two planes meet.  `[E · wide · structure, calm]`
**ABS-03 · Ripple rings** — dark liquid rings expanding on black, a cool rim on each ring, a warm point at the center.  `[E · sq · cause, spread]`
**ABS-04 · Grid to void** — a fine cool dot grid dissolving into deep black negative space.  `[S · sq · data, emptiness]`
**ABS-05 · Refraction shards** — dark glass shards refracting a thin spectrum edge, mostly black around them.  `[S · sq · complexity, facets]`
**ABS-06 · Single hairline** — one glowing hairline curve on black, cyan bleeding into violet, vast empty space.  `[S · wide · minimal, focus]`
**ABS-07 · Smoke column** — a column of cool smoke standing in a black void, lit warm from one low side.  `[E · wide · form, rise]`
**ABS-08 · Contour field** — faint cool topographic contour lines on black, one warm ridge picked out.  `[E · sq · terrain, map]`
**ABS-09 · Nested arcs** — overlapping thin luminous arcs, cyan through green to violet, spotlight not wallpaper.  `[S · wide · brand, rhythm]`
**ABS-10 · Particle drift** — sparse cool particles suspended in black, a few catching a warm light.  `[E · sq · systems, scatter]`
**ABS-11 · Möbius glow** — a single dark looping ribbon, a cool sheen along its twist, one warm edge.  `[S · sq · recursion, loops]`
**ABS-12 · Split field** — a black frame divided by one luminous seam, cool on one side, warm on the other.  `[E · wide · contrast, before/after]`

---

## LGT · Light & atmosphere

The light is the subject. Haze, beams, bokeh, reflection. Best when you want mood with almost nothing in frame.

**LGT-01 · Volumetric beam** — a single shaft of cool light cutting a dark hazy room, warm dust motes near the source.  `[E · wide · reveal, focus]`
**LGT-02 · Anamorphic flare** — a cyan anamorphic flare streaking across black, one warm bloom point on it.  `[E · wide · speed, cinema]`
**LGT-03 · Bokeh field** — a deep-black frame of soft out-of-focus lights, cool with a few warm amber orbs.  `[E · sq · depth, city]`
**LGT-04 · Spotlight pool** — one warm pool of light on a dark floor, cold surround, long shadows reaching out.  `[E · sq · attention, singular]`
**LGT-05 · Wet street** — a wet dark street reflecting cyan and one warm sodium sign, nothing legible.  `[E · wide · noir, night]`
**LGT-06 · God rays** — cool crepuscular rays through a dark structure, a warm rim where they land.  `[E · wide · descent, reveal]`
**LGT-07 · Screen bloom** — the diffuse cyan bloom of an unseen screen in a black room, a warm lamp edge nearby.  `[E · sq · work, late]`
**LGT-08 · Prism cast** — a thin spectrum cast thrown across a black surface, cyan to green to violet.  `[S · sq · brand, refraction]`
**LGT-09 · Ember scatter** — scattered warm embers the only light in cold darkness, drifting.  `[E · sq · aftermath, heat]`
**LGT-10 · Horizon band** — a single luminous horizon band separating black above from black below.  `[S · wide · minimal, hero]`
**LGT-11 · Backlit haze** — a figure or object as a black shape in cool backlit haze, one warm edge.  `[E · sq · anonymity, mood]`
**LGT-12 · Caustics** — cool water caustics rippling across a dark surface, one warm glint.  `[E · sq · flow, surface]`

---

## OBJ · Objects & still life

One object, editorial product feel. Best for concrete, tangible topics and clean single-idea cards.

**OBJ-01 · Chip on dark** — a lone microchip on a dark surface, cool key light, one warm rim, product-macro detail.  `[E · sq · silicon, unit]`
**OBJ-02 · Night desk** — a dark desk at night, a closed laptop, cool ambient, a warm lamp just out of frame.  `[E · wide · work, quiet]`
**OBJ-03 · Record groove** — a record on a black turntable, cool sheen along the grooves, a warm stylus-lamp glint.  `[E · sq · craft, analog]`
**OBJ-04 · Wrench on steel** — a single wrench on a dark workbench, cold metal, one warm bulb overhead.  `[E · sq · tools, fix]`
**OBJ-05 · Backlit glass** — a backlit glass of water on black, cool refraction through it, a warm rim from the side.  `[E · sq · clarity, simple]`
**OBJ-06 · Film camera** — an old film camera in shadow, cool light on the body, a warm reflection in the lens.  `[E · sq · seeing, craft]`
**OBJ-07 · Brass key** — a single brass key on black, warm specular on the metal, cool fill light.  `[E · sq · access, trust]`
**OBJ-08 · Paper stack** — a neat stack of dark paper edge-on, cool top light, one warm edge glow.  `[E · sq · records, proof]`
**OBJ-09 · Unlit bulb** — a clear bulb against black, cool glass, one warm filament ember waking.  `[E · sq · idea, spark]`
**OBJ-10 · Compass** — a brass compass on a dark map, cool ambient, a warm glint on the needle.  `[E · sq · direction, plan]`
**OBJ-11 · Loose cable** — a single coiled cable on black, cool sheen, one warm connector lit.  `[E · sq · connection, plumbing]`
**OBJ-12 · Stacked coins** — a short stack of dark coins edge-lit, cool metal, one warm rim.  `[E · sq · cost, economics]`

---

## ARC · Architecture & space

Built space, interiors, structures. Best for scale, systems you move through, and wide banners with room on the left.

**ARC-01 · Empty atrium** — a vast dark modern atrium, cool skylight above, one warm fixture far below.  `[E · wide · scale, institution]`
**ARC-02 · Brutalist stair** — a concrete stairwell in shadow, cold raw concrete, a warm exit light around a turn.  `[E · sq · path, ascent]`
**ARC-03 · Data hall** — a long cool server hall in one-point perspective, a warm status point at the vanishing point.  `[E · wide · infra, depth]`
**ARC-04 · Dark loft** — a loft with big windows at cool dusk, a single warm desk lamp lit inside.  `[E · wide · work, solitude]`
**ARC-05 · Underpass** — a concrete underpass, cool blue depth, a warm sodium lamp at the far mouth.  `[E · wide · transition, night]`
**ARC-06 · Glass facade** — a dark glass building, cool reflections across it, one warm sunset pane.  `[E · wide · scale, surface]`
**ARC-07 · Long corridor** — a long dark corridor, cool floor light, a warm door left ajar at the end.  `[E · wide · journey, choice]`
**ARC-08 · Rooftop plant** — a rooftop against a cool black city skyline, one warm mechanical fixture humming.  `[E · wide · infra, city]`
**ARC-09 · Library stacks** — dark rows of shelves receding, cool aisle light, one warm reading lamp.  `[E · sq · knowledge, archive]`
**ARC-10 · Bridge cables** — the cool geometry of a suspension bridge at night, one warm marker light.  `[E · wide · structure, span]`
**ARC-11 · Empty theater** — a dark empty auditorium, cool stage wash, one warm work light.  `[E · wide · audience, stage]`
**ARC-12 · Concrete vault** — a dim concrete vault or tunnel curving away, cool depth, a warm end glow.  `[E · sq · depth, contain]`

---

## TEX · Texture & material

Surface as subject, filling the frame. Best as a quiet background under heavy text, or a tactile brand banner.

**TEX-01 · Black glass** — brushed black glass catching a thin cyan sheen and one warm reflection.  `[S · wide · brand, surface]`
**TEX-02 · Oxidized steel** — a dark weathered steel plate, cool cast over it, a warm rust bloom in one corner.  `[E · sq · time, wear]`
**TEX-03 · Liquid metal** — dark reflective liquid metal, cool highlights rolling across, one warm point reflection.  `[E · sq · flow, sheen]`
**TEX-04 · Carbon weave** — a macro of carbon fiber, a cool sheen running the weave, one warm glint.  `[E · sq · engineering, fine]`
**TEX-05 · Wet slate** — dark wet slate, cool reflection on the surface, a warm rim from a low source.  `[E · sq · quiet, matte]`
**TEX-06 · Ink in water** — dark ink blooming through black water, cool front light, one warm tendril curling.  `[E · sq · spread, organic]`
**TEX-07 · Frosted acrylic** — a sheet of frosted dark acrylic diffusing a spectrum edge behind it.  `[S · wide · brand, soft]`
**TEX-08 · Concrete grain** — raw concrete macro, cool top light grazing the grain, one warm scuff catching light.  `[E · sq · raw, ground]`
**TEX-09 · Silk fold** — dark folded silk, a cool sheen in the folds, a warm crease highlight.  `[E · sq · luxury, drape]`
**TEX-10 · Cracked earth** — dry cracked ground under cold light, a warm seam glowing between the plates.  `[E · wide · drought, fracture]`
**TEX-11 · Sand ripple** — a macro of rippled dark sand, cool side light along the ridges, one warm crest.  `[E · sq · pattern, time]`
**TEX-12 · Chalkboard slate** — a matte black slate surface, cool even light, one warm smudge of light in a corner.  `[E · sq · ground, neutral]`

---

## MOT · Motion & energy

Movement frozen or smeared. Best for speed, force, momentum, change, and energetic brand pieces.

**MOT-01 · Light trails** — long-exposure cool light trails sweeping through black, one warm streak among them.  `[E · wide · speed, flow]`
**MOT-02 · Spark shower** — a cascade of warm sparks against cold dark steel.  `[E · sq · making, energy]`
**MOT-03 · Water crown** — a frozen dark water crown mid-splash, cool rim, one warm backlight.  `[E · sq · impact, instant]`
**MOT-04 · Spectrum smear** — a fast spectrum smear across black glass, cyan into green into violet, motion made light.  `[S · wide · brand, speed]`
**MOT-05 · Smoke vortex** — a slow cool smoke vortex turning in black, lit warm from one side.  `[E · sq · turbulence, form]`
**MOT-06 · Particle burst** — sparse cool particles bursting outward from a warm core point.  `[E · sq · release, spread]`
**MOT-07 · Rain streaks** — cool vertical rain against black, one warm street lamp behind blurring it.  `[E · wide · noise, night]`
**MOT-08 · Disc blur** — a motion-blurred dark spinning disc, cool rim, a warm tangent glint.  `[E · sq · momentum, cycle]`
**MOT-09 · Wind field** — cool grass or fiber bent by wind under low light, a warm horizon beyond.  `[E · wide · force, field]`
**MOT-10 · Energy arc** — a single electric arc, cyan core, a warm flare where it grounds.  `[E · sq · power, jump]`
**MOT-11 · Falling shards** — dark shards frozen falling through black, cool rims, one warm glint.  `[E · sq · break, change]`
**MOT-12 · Slipstream** — a cool slipstream of blurred lines converging to a warm point of light.  `[S · wide · speed, focus]`

---

## Compose your own

The formula, in order:

```
[subject or scene]  +  [where the warm accent sits]  +  [which side stays empty for text]  +  [texture / grain]  +  BASE  +  CLOSER
```

Four dials that decide whether a prompt lands:

- **One warm source, contained.** Never a flood. A rim, a kicker, a lamp, a sliver of golden hour, a sodium glow. This is the single focal point and the thing that makes the frame feel lit instead of flat. Cool recedes, warm advances, so the accent also buys you depth.
- **Negative space is deliberate.** Square: keep the lower third quiet and dark for the scrim, interest up top. Wide: subject in the right third, left half falls into shadow for the headline.
- **Subject matches the story sideways, never on the nose.** A trust story wants a lone figure lit by a screen. A feedback-loop story wants something recursive or mirrored. An economics story wants scale and contrast. Don't illustrate the concept literally.
- **Photograph, not illustration.** Editorial or documentary, large-format, shallow depth, fine grain. Moody and restrained. Never stock-photo cheerful.

To flip any editorial prompt to the brand sweep, drop the warm-amber source and swap in the `[S]` base: keep the subject as a dark silhouette and let the cyan-green-violet arc be the only color.

---

## Already rendered

Prompts are for new work. When you need a finished frame now, the shared libraries hold pre-rendered backgrounds in this exact grade:

- `pietro-works-env/stack/pietro-context/assets/backgrounds/` — `bg-spectrum-sweep`, `bg-spectrum-corner`, `bg-spectrum-vertical`, `bg-ambient-minimal`, `bg-dot-field` (the brand `[S]` set; `bg-spectrum-sweep` is the hero band).
- `pietro-works-env/queue/Pietro Dispatch/2026-06-30/bg-db/` — `bg-01.png` to `bg-20.png`, the fluxogram `[E]` steel-and-warm-glow set.
