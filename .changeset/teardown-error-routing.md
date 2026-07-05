---
'octane': patch
---

Error-handling fixes surfaced by the Tier-7 React error-boundary port (React 19 parity):

- **Deletion-phase errors reach boundaries**: an error thrown by an unmount cleanup used to be swallowed with `console.error`; it is now collected during the teardown walk and dispatched to the boundary enclosing the deletion after the walk completes (a boundary inside the deleted range is itself dying and is skipped), so the enclosing `@try` shows its `@catch` like React's `commitDeletionEffects` error routing.
- **Throwing ref detaches route to the boundary too**: a callback ref that throws on its `null` detach no longer escapes `flushSync` to the caller — the queued detach is guarded, the remaining detaches/attaches still run, and the error reaches the nearest still-mounted boundary.
- **Refs of aborted mounts are never invoked**: when a boundary unwinds a mount that never completed, the queued ref detach is suppressed — React never calls a ref (not even with `null`) for work that never committed. A previously-attached ref still detaches normally on real unmounts.
- **Uncaught errors unmount the whole tree**: when no boundary handles an error, the failed root's entire tree is removed from the DOM before the error is rethrown from the flush (React's documented contract — known-broken UI never stays on screen). Unrelated roots batched into the same flush keep draining.

The port also stress-verified the LIS keyed reconciler under mid-reconcile throws (40 seeded shuffle streams of 101 keyed rows, byte-equal against from-scratch baselines) — no inconsistency found.
