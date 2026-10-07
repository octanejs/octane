---
'octane': patch
---

Ship less signal engine code to applications that use `signal$`, `derived$`,
`query$` or `useSignal$` without calling `createScope`. The scopes the runtime
creates for those declarations no longer carry the public `Scope` methods. The
first `createScope` call installs `serialize`, `inspect`, `derived$`, `get`,
`set`, `isPending`, `batch` and `action`, and only a debug scope records a
trace. Client bundles also no longer carry the server-side serialization of
native reads.

Signal applications are 0.87 to 1.12 kB smaller gzipped. Applications without
signals are unchanged, and `createScope` keeps its whole API.
