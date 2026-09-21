---
'octane': patch
---

Admit keyed `@for` item bodies whose only nested structure is host-only
conditional content to the `forBlock` PURE fast path: an `@if` arm that renders
only host output (including a narrowly proven nested keyed `@for`) carries
nothing opaque, so with no parent captures the body is a pure function of the
item and unchanged-identity survivors skip re-render entirely. The admission
fails closed — a component tag inside the conditional, one hidden behind a
function boundary such as a memoizable call's `t => <Tag />` callback argument,
a render-time hazard like an assignment in the `@if` test, or a live imported
member read keeps the body off the pure path.
