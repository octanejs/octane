---
"octane": patch
---

`useSyncExternalStore`: replace the per-commit layout effect with a dedicated
store-sync queue.

The value-sync previously ran as a `useLayoutEffect` with
`[subscribe, value, getSnapshot]` deps, so every snapshot change — and, for the
dominant inline-`getSnapshot` pattern the zustand/query bindings produce, every
render — paid effect enqueue, deps compare, and the drainPhase post-order sort per
subscriber. Store syncs now go through a dedicated sort-free queue drained in
`commitEffects` right after the layout phase (React's `updateStoreInstance` shape):
one identity-stable inst cell per hook, a render-phase gate that enqueues only when
the snapshot or store actually changed, and offscreen/WIP capture integration so
abandoned transition renders drop their syncs. Subscription lifecycle stays a real
passive effect. One intentional divergence recorded in the parity plan: a
getSnapshot-identity-only change with an unchanged value no longer forces a
commit-time re-read.
