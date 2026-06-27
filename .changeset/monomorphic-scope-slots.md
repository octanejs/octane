---
"octane": patch
---

Internal: store a scope's binding bag and control-flow / component / child slots in a per-scope dense `slots` array indexed by a compile-time slot index, instead of dynamic `scope["_for$N"]` string-key own-properties.

Previously each compiled body stamped its bindings (`b$N`) and slot states (`_for$N`, `_if$N`, `_comp$N`, …) directly on the scope as string-keyed own-properties, which made the Scope/Block hidden class polymorphic across components and turned slot access into a computed-key lookup. They now live in `scope.slots[i]` (bag at index 0), so the scope object shape is monomorphic and slot access is an array index. The `[key: string]: any` escape hatch is removed and the Scope/Block interfaces are fully typed. No public API or behavior change; compiled `.tsrx`/`.tsx` output format changed (regenerate any committed build output).
