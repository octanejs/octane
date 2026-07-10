---
'octane': patch
---

SSR warm walk — the server now executes compiled `__warm` fetch plans, completing the parallel-`use()` mirror across component depth. When a component's first batch suspends, its warm thunk starts descendant components' provably-independent creations (recursing through each child's own `Comp.__warm` plan, the same eligibility rules as the client: warm-safe props, guard chains preserved, edges gated on suspended data cut) and registers them with the render loop, so nested independent fetches all go out in pass 1: a depth-8 chain of ~4ms fetches renders in one ~4.6ms round instead of eight (new `ssr-throughput` `parallel-nested-d4/d8` ops, p50 flat across depth). The descendant's real render adopts the warmed promise by slot + deps (transfer semantics — each fetch fires exactly once; a props drift between warm and render is a clean miss). Seed order, true-dependency sequencing, and the `parallelUse: false` opt-out are unchanged.
