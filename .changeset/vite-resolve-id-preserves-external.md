---
'octane': patch
---

Preserve the full resolution when the Vite plugin rewrites a client runtime
request to its server counterpart during an SSR build.

The hook returned only `resolved.id`, so `external: true` was dropped and
rolldown tried to bundle an external specifier such as `octane/signals/server`
as a path relative to the importer, failing the build with
`UNLOADABLE_DEPENDENCY`. Returning the resolution keeps `external` along with
`moduleSideEffects` and `meta`.
