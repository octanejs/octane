---
'@octanejs/tanstack-table': patch
---

Retarget the TanStack Table binding from v8 to v9.

The binding previously wrapped `@tanstack/react-table` v8's `useReactTable` +
`flexRender`. It now ports the v9 adapter: `useTable`, `Subscribe`,
`flexRender`/`FlexRender`, `createTableHook`, and `createTableHookContexts`, over
`@tanstack/table-core@9`. Table state lives in TanStack Store atoms through
table-core's `coreReactivityFeature` bindings, and re-renders are driven by
`useSelector` from `@octanejs/tanstack-store` over the selected slice, so
`useTable(options, selector)` and `table.Subscribe` both give fine-grained
subscriptions.

This is a breaking change for existing users of the binding:

- `useReactTable(...)` is replaced by `useTable(...)`, and the v8
  `get*RowModel()` options are replaced by v9's tree-shakeable `features`
  option (`tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), … })`).
- `row.getVisibleCells()` now requires `columnVisibilityFeature`; the always
  available accessor is `row.getAllCells()`.
- `table.getState()` is replaced by `table.state` (the selected projection).
- A user-supplied `onSortingChange`-style handler now *replaces* the feature's
  default atom writer instead of composing with it, so pair it with `state`.

Upstream's `useLegacyTable` v8-compatibility entry is intentionally not ported —
it exists to migrate existing React v8 codebases, which an octane binding has
none of.

`useTable` and `useAppTable` end in an optional `selector` parameter, so both
split the compiler-injected trailing hook slot off their rest args; without that
`useTable(options)` would read the slot symbol as the selector.

Every TanStack Store primitive is imported from `@octanejs/tanstack-store`
(which re-exports all of `@tanstack/store`) rather than from the store core
directly, so the binding has a single path to it and atom identity cannot be
split across two copies.
