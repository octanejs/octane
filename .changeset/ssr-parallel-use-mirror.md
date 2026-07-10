---
'octane': patch
---

SSR mirror of parallel `use()`. The compiler's memoize + hoist/batch passes now run on server bodies too (same `parallelUse: false` opt-out): independent `use()` creations register with the render loop in one batch before the first suspend, so a body stratum of K independent fetches costs ONE network round instead of K — measured flat at ~1×latency for k=4 and k=8 in the new `ssr-throughput` `parallel-k*` ops. Creations are memoized in a keyed cross-pass cache (`puMemo`), so discovery re-runs and the final canonical pass reuse the same in-flight promise instead of re-firing the fetch (a D=3 waterfall's first-level creator now fires once, previously three times). Batch-registered thenables resolve at their unwrap sites by instance identity; plain `use()` sites keep their exact occurrence-keyed semantics, and hydration seed order (use()-call order) is unchanged. True data dependencies remain sequential.
