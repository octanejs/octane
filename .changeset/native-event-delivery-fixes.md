---
'octane': patch
---

Native event delegation fixes (surfaced by the Tier-3 React event-matrix port — 212 conformance tests, all passing):

- **Non-bubbling native events now reach their target's handler.** The media/resource lifecycle family (`play`, `pause`, `timeupdate`, `load`, `error`, `loadstart`, …), `toggle`/`beforetoggle`, `close`/`cancel`, `abort`, and `resize` were delegated with a bubble-phase root listener that never hears a non-bubbling event — so `onPlay` on the `<video>` itself silently never fired. They are now capture-delegated with target-only delivery: the target's own handler fires, ancestors' do not — exactly the platform contract. (React's synthetic layer re-dispatches these up the tree; octane deliberately does not — documented intentional divergence.)
- **Capture handlers now fire before bubble/target handlers for capture-delegated types** (`focus`, `blur`, `invalid`, `scroll`, `scrollend`, and the new family). Both dispatchers are capture-phase listeners on the same root, so same-node registration order used to invert React/platform ordering (bubble walk before capture pass). The walk dispatcher now runs the capture pass explicitly first and honors a capture-phase `stopPropagation`.
- **A throwing or invalid listener no longer aborts the dispatch walk.** Each handler invocation is guarded like a separate native listener: exceptions surface through the global error event (`reportError`, with the standard polyfill fallback) and the walk continues to ancestors; a non-function listener value is reported and skipped instead of crashing dispatch.
