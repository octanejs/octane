---
'octane': patch
---

Cut the per-render cost of value-position element descriptors, the shape every
`@octanejs/*` binding and every `createElement`/`.map()` child tree produces.
`createElement` no longer allocates a property descriptor per call to detect
React's DEV-only `key` warning getter (that probe is now DEV-gated exactly as in
React's `hasValidKey`), a keyed element no longer pays a WeakSet insert to record
key presence that its non-null `key` already proves, `prepareDeoptList` builds
its output arrays only once a list regime is established, and every renderable
hole no longer re-reads its host's tag from the DOM to re-check a void-element
constraint its enclosing list already validated.

On the `memo-wall` benchmark (1000 `memo(Row)` children reached through a
`{rows}` children hole) this drops a parent re-render absorbed by 1000 prop bails
from 0.272ms to 0.177ms, a single-row change amid the wall from 0.275ms to
0.184ms, and a context bump through the wall from 0.610ms to 0.517ms. Exact
render counts and compiled-work counts are unchanged, and `memo-wall` now carries
ratio guards for all three wall-B operations.

The server runtime gets the same two allocation fixes that apply to it (the key
probe and the deferred child-list arrays) so the client and server descriptor
paths stay in step; `ssr-throughput` shows no measurable change from them.
