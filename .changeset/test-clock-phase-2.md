---
'octane': patch
---

`installTestClock()` now also owns idle and streamed hydration timers, deferred-hydration event fallbacks, `octane/data` freshness, retention and feed reconnects, signal action timeouts and resize-observer delivery. Its new `dateNow()` is the `Date.now()` that `octane/data` stamps and compares, so `advance(ms)` makes cached reads stale and expired as real time would. On the clock, an idle callback runs as a task due when it is requested, and a hidden page draws no frames, so passive effects take their hidden-page path.
