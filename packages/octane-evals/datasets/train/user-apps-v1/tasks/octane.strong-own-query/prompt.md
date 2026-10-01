# Repair Strong-mode search panel focus

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:8:19: [OCTANE_STRONG_OWN_MARKUP_QUERY] Strong mode does not allow `document.getElementById()` to find the `#search-input` <input> this component renders. Attach a ref instead: `const element = useRef(null)`, `ref={element}` on the <input>, then use `element.current` in the effect or event. Portal targets and markup rendered elsewhere stay queryable.
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which renders two `SearchPanel` sections titled `Docs` and `Blog`.
- Each panel has a search input and a `Focus search` button that focuses that panel's own input.
- The page must not contain duplicate element IDs.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
