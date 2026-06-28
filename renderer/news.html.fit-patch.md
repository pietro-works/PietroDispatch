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
