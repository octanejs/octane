---
'octane': patch
---

`useDeferredValue` React-parity fixes (closes the five gaps pinned from
ReactDeferredValue-test.js) via a "deferred lane" bit on the scheduler:

- **Render-phase updates inherit the in-progress render's priority**: a
  setState fired while the same component's body is rendering replays at the
  current pass's priority (and deferred bit) instead of always urgent — so a
  transition render that syncs state from props no longer makes
  `useDeferredValue` defer in the replay (both values commit in one pass).
- **Only the first `useDeferredValue` level defers**: the spawned deferred
  swap tags its re-render pass as deferred (`Block.currentRenderDeferred`); a
  `useDeferredValue(value, initialValue)` MOUNTING inside that pass adopts the
  final value directly instead of waterfalling its own preview — the outer
  preview already covered the loading state (React's anti-waterfall rule).
- **Hidden `<Activity>` trees behave like fresh mounts for the hook**: a value
  change while hidden re-renders the NEW preview state (prerender keeps up);
  revealing hidden→visible with a different value shows the preview first
  (with `initialValue`) or adopts the new value immediately (without) — the
  hidden tree's committed value never flashes on reveal. Revealing with an
  identical value still skips the preview (prerender payoff, unchanged).
