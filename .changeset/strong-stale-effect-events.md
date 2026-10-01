---
'octane': patch
---

`OCTANE_STRONG_STALE_STATE_UPDATE` no longer reports state an Effect Event
captures, in its body or in helpers it calls synchronously, because an Effect
Event reads the latest committed values even when a timer or promise calls it.
A snapshot passed to an Effect Event from deferred code, values computed from
it, and timer or promise callbacks created inside the Effect Event are still
checked. So is a value computed from state at the call site and passed to an
Effect Event or helper from deferred code, like `apply(n + 1)` after an await.
