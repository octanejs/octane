---
"octane": patch
---

Internal: store a scope's binding bag and control-flow / component / child slots in a per-scope dense `slots` array indexed by a compile-time slot index, instead of dynamic `scope["_for$N"]` string-key own-properties.

Previously each compiled body stamped its bindings (`b$N`) and slot states (`_for$N`, `_if$N`, `_comp$N`, …) directly on the scope as string-keyed own-properties, which made the Scope/Block hidden class polymorphic across components and turned slot access into a computed-key lookup. They now live in `scope.slots[i]` (bag at index 0), so the scope object shape is monomorphic and slot access is an array index.

- Slot indices are assigned in execution (source-id) order, so each scope's `slots` array is written front-to-back and stays packed (not a holey/dictionary-mode array).
- `headBlock` (the `<title>`/`<meta>`/`<link>`→`<head>` hoisting) and `hostComponent` (the runtime host-with-children proxy used by `@octanejs/motion`) were the last helpers stamping `(scope as any)[key]`; both now use the `slots` array, so there are **no** remaining dynamic scope-key stamps. `headBlock` and `hostComponent` gained a leading numeric slot argument (internal/advanced APIs; `headBlock` keeps the content key for SSR adoption).
- The `[key: string]: any` escape hatch is removed from `Scope`/`ScopeImpl`/`BlockImpl` and the interfaces are fully typed.

No public component-API or behavior change; compiled `.tsrx`/`.tsx` output format changed (regenerate any committed build output).
