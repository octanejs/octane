---
"octane": patch
---

React parity: numeric `style` object values now get `px` appended.

A bare number given to a style property is coerced the way React does — `style={{ width: 100 }}`
now produces `width: 100px` instead of the invalid `width: 100`. The known **unitless**
properties (`opacity`, `zIndex`, `lineHeight`, `flex`, `gridRow`, `strokeWidth`, …, plus their
vendor-prefixed variants) stay raw, `0` never gets a unit, and custom properties (`--x`) are
left untouched. String values are unchanged.

The rule is applied consistently everywhere a style object is realized — the dynamic runtime
path (`setStyle`), server rendering (`ssrStyle`), and the compiler's static-object bake — so
static and dynamic styles agree and SSR hydrates without a mismatch. The static bake also now
hyphenates camelCase keys (`fontSize` → `font-size`), matching the runtime.
