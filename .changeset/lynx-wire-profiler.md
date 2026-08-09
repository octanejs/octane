---
'@octanejs/lynx': patch
---

Add a permanent, build-flag-gated wire profiler to the dual-thread transport.

Defining `__OCTANE_LYNX_PROFILE__` as `true` in the app build makes each
thread accumulate commit-pipeline counters in
`globalThis.__OCTANE_LYNX_PROF`: commits, host commands, and serialized
commit bytes on the background side, plus per-stage milliseconds
(self-check, dispatch, validate, prepare, apply, acknowledge). The command
and byte counters are deterministic for a fixed app and interaction
sequence, which is what lets `benchmarks/lynx-table` gate the wire cost of
a commit in CI. Bundles that do not define the flag compile the counters
away; the hot dispatch and receive paths pay nothing.
