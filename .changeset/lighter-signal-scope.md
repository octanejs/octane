---
'octane': patch
---

Ship less signal engine code to applications that use `signal$`, `derived$`,
`query$` or `useSignal$` without calling `createScope`. The scopes the runtime
creates for those declarations no longer carry the public `Scope` methods. The
first `createScope` call installs `serialize`, `inspect`, `derived$`, `get`,
`set`, `isPending`, `batch` and `action`, and only a debug scope records a
trace.

Signal applications are 0.49 to 0.65 kB smaller gzipped. Applications without
signals are unchanged, and `createScope` keeps its whole API.
