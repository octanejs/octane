---
"octane": patch
---

`flushSync()` now flushes renders scheduled by the effects it commits. A layout
effect that calls `setState` (e.g. `useTransitionStatus`'s rAF→`flushSync(setState)`)
schedules a render while `syncFlush` is set, which previously left that render stranded
in the queue with no microtask armed — so the update never committed until an unrelated
update happened to flush it. `flushSync` now hands those effect-scheduled renders to
the normal async scheduler before returning, so transition/`useTransitionStyles` state
lands as expected.
