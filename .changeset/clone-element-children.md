---
"octane": patch
---

Add React-compatible `cloneElement`, `Children`, and `isValidElement` to the public API.

These operate on octane's element descriptors (`createElement` / JSX-at-value) and children
values, mirroring React's semantics so libraries that inspect or re-project children — a
Radix-style `Slot`/`asChild`, `Children.only`, `Children.map`, etc. — port unchanged.

- `cloneElement(element, config?, ...children)` — shallow-merges props (config wins),
  overrides `key`, and replaces children when passed (else keeps the original). `ref` merges
  as a normal prop (octane is ref-as-prop).
- `Children.map` / `forEach` / `count` / `toArray` / `only` — flatten nested arrays and treat
  `null`/`undefined`/booleans as empty (visited as `null`; dropped from `toArray`/`map`
  results), matching React's traversal.
- `isValidElement(value)` — true for `createElement` / JSX descriptors.

Verified byte-for-byte against React via the differential rig (the same fixture runs through
octane and `@tsrx/react`, where these imports resolve to React's own implementations).
