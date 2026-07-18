---
'@octanejs/scan': patch
'octane': patch
---

New binding: `@octanejs/scan` — react-scan's programmatic core for Octane
(`scan`, `setOptions`, `getOptions`, `getReport`, `onRender`, commit
callbacks, and console render logging), built on the profile-build inspection
channel; render callbacks receive an `OctaneRenderInfo` with schedule causes
and a pull-based `domNodes()` resolver in place of React fibers. Requires
compiling with `octane({ profile: true })`. `octane/profiling` gains the
`__profileComponentId` devtools ABI backing `onRender`'s component targeting.
