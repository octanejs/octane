---
'octane': minor
---

Ship less signal engine code to applications that use `signal$`, `derived$`,
`query$` or `useSignal$` without calling `createScope`. Owner scopes the runtime
creates for those declarations get the public `Scope` methods (`serialize`,
`inspect`, `derived$`, `get`, `set`, `isPending`, `batch` and `action`) only once
the program can hold one: `createScope`, `currentSignalOwner` and
`installSignalOwnerEnvironment` from `octane/signals` install them first. Only a
debug scope records a trace.

`SignalOwnerEnvironment` now carries owners as `SignalOwnerIdentity` values. A
host carrier, including one installed through `octane/server`, can store and
return the owners it receives but can no longer narrow them to `Scope` and call
its methods. Carriers that store owners as `SignalOwner` compile unchanged.

Signal applications are 0.49 to 0.65 kB smaller gzipped. Applications without
signals are unchanged.
