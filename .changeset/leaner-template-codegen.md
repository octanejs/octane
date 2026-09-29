---
'octane': patch
---

Emit smaller client code for `.tsrx` templates and compiled `.tsx` components
without changing what they render or the work they do. Component call sites no
longer pad their arguments with `undefined`, text-hole updates pass only the
arguments an update uses, and binding bags read their DOM nodes directly
instead of through copied locals. Across the compiler's test fixtures, minified
output shrinks by about 3% and gzipped output by about 2%.
