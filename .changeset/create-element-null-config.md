---
'octane': patch
---

`createElement` now accepts `null` as its config under `strictNullChecks`, matching React's `props?: P | null` signature. A bare `null` config infers props from the element type alone, and a non-null config still enforces required props. `Fragment`'s props are exported as `FragmentProps` (as in React), so declarations emitted for `createElement(Fragment, null)` reference that type instead of inlining it.
