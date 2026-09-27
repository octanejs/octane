---
'octane': patch
---

Stamp compiler-proven pure component bodies with `$$stable` (`markStable`,
exported to compiled output as the compact `__st` ABI) so a shallow-equal
parent update keeps the committed subtree — React.memo's bailout without the
wrapper.

The compiler emits the stamp only when it can prove the body's committed output
is a pure projection of its props snapshot: no render-position `useContext` /
`use` / `useFormStatus` reads, no mutable ref contents, no live imported member
reads, no unwitnessed module state. Deferred hook bodies (effects, callbacks,
deps-gated factories) are admitted because they run at commit time, never in
the skipped render; sync-factory hooks keep their arguments under render rules.
Bodies that only fail strictness through runtime-tracked context reads still
qualify as bail-safe for same-module children, iterated to a fixed point so
declaration order cannot matter — a bailed parent keeps a child's committed
subtree, which is only equivalent when the child is bail-safe too.

Every props-equality bail (explicit `memo`, `$$stable`, implicit) now declines
through one shared hazard veto, `blockBailUnsafe`: an unmounted or invalid
first attempt, a descendant veto-capable compare (`$$compareInChain`), an
unpublished Effect Event payload, a held rolled-back transition update, or an
update suppressed by an aborted sibling transaction always re-runs the body.
Context-reading components fail closed at compile time, while memoInChain
stamping keeps provider commits reaching a stamped subtree's consumers.

A context-free memoized callee inside `@if` also keeps its lite lowering — the
memo guard wraps the same `componentSlotLite` call instead of minting a Block
per callsite.
