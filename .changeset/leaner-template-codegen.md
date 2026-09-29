---
'octane': patch
---

Emit smaller client code for `.tsrx` templates and compiled `.tsx` components
without changing what they render or how fast they update. Component call sites
no longer pad their arguments with `undefined`, a `{value as string}` text hole
mounts through one shared runtime call instead of an inlined type check, and
binding bags read their DOM nodes directly instead of through copied locals.
Across the compiler's test fixtures, minified output shrinks by about 6% and
gzipped output by about 3%.
