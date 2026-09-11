---
'octane': patch
---

Compile fixed-key inline style object literals into per-property updates. Bake
literal declarations into the HTML template and update one dynamic property
with a scalar binding or set up multiple properties together before applying
guarded scalar updates. Retain general style object handling for spreads,
computed keys, and overlapping CSS aliases.
