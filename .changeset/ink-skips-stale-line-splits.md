---
'@octanejs/ink': patch
---

Skip splitting an unchanged terminal frame when only Ink's cursor position moved.

Both standard and incremental rendering already retain the previous frame's line
geometry, but cursor-only updates rebuilt the entire line array before discarding
it. Reusing the retained geometry preserves the emitted escape sequences while
removing that whole-frame allocation. In the `ink-cursor-update` benchmark, 80
cursor moves over separately materialized equal 20,000-line frames dropped from
25.3 ms to 4.5 ms in both modes, with initial and changed-output rendering
unchanged.
