---
'octane': patch
---

`createElement` now accepts `null` as its config under `strictNullChecks`, matching React's `props?: P | null` signature. A bare `null` config infers props from the element type alone, and a non-null config still enforces required props.
