# news.html fit patch

Two edits to the copy of `news.html` in `renderer/`. Apply both before rendering anything. They are the size-and-layout half of the text-disposition fix; the text half lives in `generation.md`.

## Edit 1 — balance the headline lines

In the `.news-headline` CSS rule, the headline currently uses `text-wrap:pretty`. Change it to `text-wrap:balance`. Balance evens the length of every line, which removes a stranded word at the top or the bottom in one move, and it composes fine with the existing shrink-to-fit loop.

Find:

```
    color:#fff; text-wrap:pretty; max-width:920px;
```

Replace with:

```
    color:#fff; text-wrap:balance; max-width:920px;
```

Leave the summary on `text-wrap:pretty`. Pretty is designed for body-length text and keeps the summary's last line clean; balance is for the short headline.

## Edit 2 — orphan guard in the fit pass

Replace the entire `fitHeadline()` function with the version below. It keeps the existing height fit and adds a guard that binds the final two words of the headline with a non-breaking space, so the last line can never be a single word. It normalizes first, so it does not drift on repeated calls, and it skips while the headline is being edited so it does not fight live typing.

Find the existing function:

```
    function fitHeadline(){
      const hl = document.getElementById('headline');
      const content = document.querySelector('.news-content');
      const canvas = document.getElementById('news');
      if(!hl || !content || !canvas) return;
      // available height for the content block = canvas minus top padding region (keep kicker clear)
      const cap = autoCheck.checked ? 96 : parseInt(range.value, 10);
      let size = cap;
      hl.style.fontSize = size + 'px';
      // budget: content block must fit within ~760px tall zone above bottom padding
      const maxH = 720;
      let guard = 0;
      while(content.scrollHeight > maxH && size > 40 && guard < 240){
        size--; hl.style.fontSize = size + 'px'; guard++;
      }
      sizeVal.textContent = autoCheck.checked ? 'auto' : size + 'px';
      if(!autoCheck.checked) range.value = size;
    }
```

Replace it with:

```
    // bind the final two words of the headline so the last line is never one word.
    // normalizes existing nbsp first to avoid drift across repeated calls.
    function bindLastTwoWords(el){
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const nodes = []; let node;
      while(node = walker.nextNode()) nodes.push(node);
      nodes.forEach(function(t){
        if(t.nodeValue.indexOf('\u00A0') !== -1){ t.nodeValue = t.nodeValue.replace(/\u00A0/g,' '); }
      });
      for(let i = nodes.length - 1; i >= 0; i--){
        const t = nodes[i].nodeValue;
        const idx = t.lastIndexOf(' ');
        if(idx !== -1){
          nodes[i].nodeValue = t.slice(0, idx) + '\u00A0' + t.slice(idx + 1);
          return;
        }
      }
    }

    function fitHeadline(){
      const hl = document.getElementById('headline');
      const content = document.querySelector('.news-content');
      const canvas = document.getElementById('news');
      if(!hl || !content || !canvas) return;
      // orphan guard: bind the last two words, unless the user is editing the headline
      if(document.activeElement !== hl) bindLastTwoWords(hl);
      // available height for the content block; shrink the headline until it clears
      const cap = autoCheck.checked ? 96 : parseInt(range.value, 10);
      let size = cap;
      hl.style.fontSize = size + 'px';
      const maxH = 720;
      let guard = 0;
      while(content.scrollHeight > maxH && size > 40 && guard < 240){
        size--; hl.style.fontSize = size + 'px'; guard++;
      }
      sizeVal.textContent = autoCheck.checked ? 'auto' : size + 'px';
      if(!autoCheck.checked) range.value = size;
    }
```

That is the whole patch. Nothing else in `news.html` changes. `news.mjs` calls `fitHeadline()` after it sets each card, so the guard runs on every rendered card without any further wiring.

One caution learned the hard way: keep the three non-breaking spaces in `bindLastTwoWords` written as the literal `\u00A0` escape in the source, not as raw U+00A0 bytes. If they land as raw bytes, an editor or a copy-paste can normalize them back to ordinary spaces, and the guard then binds a plain space, which does nothing. The escape is ASCII and survives that. After applying, confirm the source still contains `\u00A0` three times.

## Edit 3 \u2014 hard two-line cap, live measurement, and the summary rule (2026-07-17)

The layout rules got teeth. Headlines are now capped at two lines and the summary is a measured two-line/fill constraint. This half is in the renderer; the char-length half is in `generation.md`.

Headline cap. `fitHeadline()` no longer shrinks on height alone. A `lineBoxCount(el)` helper counts real rendered line boxes via `Range.getClientRects()` deduped by rounded `top` (robust to the inline `.hl` gradient span, which puts multiple rects on one line). The shrink loop now runs while `content.scrollHeight > maxH` OR `lineBoxCount(hl) > 2`, down to a `HEADLINE_FLOOR` of 54px (raised from 40: below 54 a 78px-design headline is unreadable in-feed, which is the signal the copy is too long, not that it should shrink further). The orphan guard can itself force a third line by binding a long final pair, so the hard two-line rule outranks it: if the headline is still >2 lines at the floor, `fitHeadline` drops the nbsp bind (`unbindWords`) and re-fits once. Net effect: a formerly-3-line headline auto-resolves to two lines at a smaller size; only a genuinely over-long headline stays flagged.

Summary rule. The summary has no auto-fit (fixed 30px DM Sans, 840px deck), so it is measure-only: "exactly two lines, second line 75-99% full" is an authoring constraint the renderer can verify but not fix. `window.measureFit()` returns `{ headlineLines, headlineSize, summaryLines, summaryFill, summaryWidth }`, reading the summary's real content-box via `summary.clientWidth` (do not hardcode 840; it survives a padding change).

Wiring in `news.mjs`. `renderCard` calls `measureFit()` after `fitHeadline` (after `document.fonts.ready`, so widths are real) and returns the metrics. The render loop prints them per card, `wrote post-XX.png  [fit ok|FAIL] h=<n>L@<size>px s=<n>L/<fill>%`, via `fitVerdict()` (hard fail: headline >2 lines, summary != 2 lines, or a 2-line summary under 75% fill; soft warn: headline under 56px = copy running long). A new `--check-fit` flag makes the run exit non-zero when any card fails; without it the run still writes every PNG and prints a `fit: N card(s) failed` summary, so a single bad card never silently aborts a good batch. No caller parses stdout, so the added report line is safe; only the opt-in flag changes the exit code.

The char-length predictor derived from this layout (summary ~113-120 chars for a filled two lines; proportional fonts make it a guide, not a guarantee) lives in `generation.md`. The measurement above is the source of truth; the char band is the writing target.
