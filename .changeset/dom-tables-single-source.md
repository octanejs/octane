---
'octane': patch
---

The DOM truth tables (boolean/must-use-property attributes, attribute aliases, SVG-only tag classification, unitless style props, void elements, style-value coercion, style-key hyphenation) now live in one shared module (`src/dom-tables.js`) imported by the compiler, `octane/constants`, and both runtimes, instead of hand-duplicated per consumer — table drift between static bakes and dynamic writes is now structurally impossible. One real divergence this fixed: statically-baked style objects now trim string values (`{color: ' red '}` → `color: red`) exactly like dynamic/SSR writes, so the same style object can no longer produce different bytes depending on whether the compiler could bake it. Also fixes the publish build, which was dropping `css.js`, `server/rpc.js`, and `static/index.js` from `dist/` — the published runtime, `octane/server`, and `octane/static` entries were unresolvable.
