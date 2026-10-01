---
'octane': patch
---

`OCTANE_STRONG_STALE_STATE_UPDATE` no longer reports state an Effect Event
captures, because an Effect Event reads the latest committed values even when a
timer or promise calls it. A snapshot passed to an Effect Event as an argument
after an `await`, and timer or promise callbacks created inside one, are still
checked.
