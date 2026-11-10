---
'octane': minor
---

Add `setLayoutSnapshotTiming('commit' | 'frame')`. With `'frame'`, every `useLayoutSnapshot` measures in the next frame's `readLayout` pass instead of at the end of each commit, and changed snapshots commit in the following `writeLayout` pass. `act()` runs the queue, and a ViewTransition update still measures with its commit. The default, `'commit'`, is unchanged.
