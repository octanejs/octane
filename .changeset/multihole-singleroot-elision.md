---
'octane': patch
---

The compiler's single-root proof is now transitive: a component whose `@{}` body is an `@if`/`@else` tree where every arm renders exactly one plain host element or one qualifying same-module component call is proven single-root through a fixed point, so its call sites (including multiple component children of one host) mount with the existing anchorless self-marked regime instead of minting a `<!--comp-->`/`<!--/comp-->` pair each. Client-mount elision only — SSR output and hydration adoption are unchanged. On the spa-navigation benchmark's 1024-leaf route this removes all 4,092 per-slot marker comments and their insertions.
