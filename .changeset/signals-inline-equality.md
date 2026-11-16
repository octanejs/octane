---
'octane': patch
---

Make recomputing chains of signal values faster. Hot equality checks are written out in place, still with `Object.is` semantics, instead of going through one shared helper that collected every value type's comparison feedback. A keyless derived value's recomputation is now small enough to inline into the dependency check, and the rare cases (a tracked channel, an earlier failure, a render collecting reads) take a wrapper around it. On alien-signals' propagate benchmark this brings chains from 1.17–1.21× alien's time to about 1.1×.
