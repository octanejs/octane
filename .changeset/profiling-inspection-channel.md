---
'octane': patch
---

Add a profile-build inspection channel to `octane/profiling` for render
devtools such as the planned `@octanejs/scan`: `profiler.subscribe()` streams
recorded events live with derived commit-batch markers, and
`profiler.domNodes(instanceId)` resolves a profiled component instance to the
top-level elements it currently renders (pull-based — recorded events remain
DOM-free). Production builds are unaffected: the channel compiles in only
under the existing `profile: true` option.
