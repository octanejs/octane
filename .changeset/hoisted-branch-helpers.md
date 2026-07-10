---
'octane': patch
---

Compiled output Phase 2: construct body helpers (`@if`/`@else` branches, `@switch` cases, `@try`/`@pending`/`@catch` arms, `<Activity>` bodies, `@for` item/`@empty` bodies, portal bodies) are now hoisted to module scope instead of being re-declared inside the component on every render — zero per-render closure allocations and stable helper identities. Captured parent locals ride the `__extra` ABI slot: the call site passes the current values as one small env tuple per construct (for `@for` it is the existing deps array doing double duty), the runtime stamps it on the construct's block, and the helper destructures it — the same values-at-last-parent-render staleness the closures had. Component children render-fns (`__children$N`) keep the inline placement (they are invoked through props, not through a construct block).
