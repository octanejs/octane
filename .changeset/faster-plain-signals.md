---
'octane': patch
---

Make reading, writing and recomputing plain signal values faster. A current value is read in one short step, a `scope.derived$` computation that reads only plain values is recomputed without the transition and adoption machinery, a value written to a current signal skips the refresh, and a derived value is no longer told of every write that reaches it while it holds a plain value. On alien-signals' own propagate benchmark this takes Octane from 2.0–2.7× alien's time to 1.2–1.9×.
