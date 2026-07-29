---
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
---

Fail the boot on a `module server` function id collision instead of silently
rerouting one function's calls to another.

An id is `strong_hash("<module>#<export>")`, a SHA-256 truncated to 8 hex
characters, whose own documentation calls it "fine for identification, not for
authentication". Both registration paths were a plain Map set, which resolves a
collision by overwriting: one function became unreachable and every call to it
executed the other one instead, under whatever authorization that other function
carries. Nothing reported it, and which function wins depends on module
evaluation order.

Dev registers through `globalThis.rpc_modules`, which is now built by
`createRpcRegistry()` and rejects a second declaration under an id another export
already took. Re-registering the same export stays a no-op, which module reloads
depend on. Production builds its descriptor map from the server manifest and
throws from `createHandler` on a duplicate id, before serving a request.

Both report the two colliding module paths and export names, and say that
renaming either export resolves it. This does not widen the id: 32 bits stays
narrow enough to collide at scale, but the failure is now loud and happens at
build or boot rather than in production traffic.
