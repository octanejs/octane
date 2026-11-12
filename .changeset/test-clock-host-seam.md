---
'octane': minor
---

Add `installTestClock()` to `octane/testing`. The clock owns the time Octane's runtime waits on: transition and deferred-update host tasks, the frame and post-paint task that run passive effects, Suspense reveal throttling, transition fallback timeouts and the shared producer budget. Nothing moves until a test calls `advance(ms)`, `frame()` or `settle()`, so timing-dependent tests no longer race the host. `act()` still runs clock work that is already due without moving time, and `uninstall()` hands any held work back to the real host timers.
