# @octanejs/tanstack-table

[TanStack Table v9](https://tanstack.com/table) for the [octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/tanstack-table
pnpm add @octanejs/tanstack-table
```

TanStack Table v9 separates a framework-agnostic core (`@tanstack/table-core`:
`constructTable` plus tree-shakeable features — sorting, filtering, pagination,
selection, visibility, expanding, grouping, faceting, …) from a thin framework
adapter. This package reuses the core unchanged (re-exported verbatim) and ports
the adapter onto octane. The public surface matches `@tanstack/react-table` v9
1:1, so code ported from React works by changing the import.

```tsx
import {
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from '@octanejs/tanstack-table';

// v9: opt into exactly the features you use — the rest is tree-shaken away.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

function People() @{
  const table = useTable({ features, data, columns });
  <table>
    <thead>
      @for (const hg of table.getHeaderGroups(); key hg.id) {
        <tr>
          @for (const header of hg.headers; key header.id) {
            <th onClick={header.column.getToggleSortingHandler()}>
              {header.isPlaceholder
                ? null
                : flexRender(header.column.columnDef.header, header.getContext())}
            </th>
          }
        </tr>
      }
    </thead>
    <tbody>
      @for (const row of table.getRowModel().rows; key row.id) {
        <tr>
          @for (const cell of row.getAllCells(); key cell.id) {
            <td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
          }
        </tr>
      }
    </tbody>
  </table>
}
```

## Entry points

| import | what you get |
| --- | --- |
| `@octanejs/tanstack-table` | everything `@tanstack/table-core` exports + `useTable`, `Subscribe`, `flexRender`, `FlexRender`, `createTableHook`, `createTableHookContexts` |
| `@octanejs/tanstack-table/flex-render` | `flexRender` / `FlexRender` alone |
| `@octanejs/tanstack-table/static-functions` | table-core's static function surface |
| `@octanejs/tanstack-table/experimental-worker-plugin` | table-core's experimental worker plugin |

## State and re-renders

v9 keeps every state slice in a TanStack Store atom. `useTable` supplies octane's
reactivity bindings to table-core, then subscribes with `useSelector`:

```tsx
// Subscribe to everything (default).
const table = useTable({ features, data, columns });
table.state.sorting;

// Or project, and only re-render when the projection changes (shallow compare).
const table = useTable({ features, data, columns }, (state) => ({
  pagination: state.pagination,
}));
table.state.pagination;
```

For finer-grained updates, keep the component subscribed to little or nothing and
opt in lower down with `table.Subscribe`:

```tsx
<table.Subscribe selector={(state) => state.rowSelection}>
  {(rowSelection) => <span>{Object.keys(rowSelection).length as unknown as string}</span>}
</table.Subscribe>

// Or subscribe to a single atom directly.
<table.Subscribe source={table.atoms.rowSelection}>
  {(rowSelection) => <span>…</span>}
</table.Subscribe>
```

## Strong-mode snapshot boundaries

This binding is pinned to `@tanstack/react-table@9.0.0-beta.58`. In that v9
adapter, `useTable` returns a reactive wrapper whose `state` and `options` are
fresh for the current render, while table-core row, header, and column objects
remain stable live objects. A compatibility component may read their methods
when its subscription rerenders it. Do not pass one of those objects into a
Strong component and call `row.getIsSelected()` or
`header.column.getIsSorted()` there: unchanged object identity is not an
immutable snapshot.

Subscribe and select on the compatibility side, then pass the selected value
through the Strong boundary:

```tsx
// Compatibility module
function SelectionBridge({ table, row }) @{
  <table.Subscribe
    source={table.atoms.rowSelection}
    selector={(selection) => !!selection[row.id]}
  >
    {(selected) => <StrongRow label={row.original.name} selected={selected} />}
  </table.Subscribe>
}
```

```tsx
// StrongRow.tsrx
"use strong";

function StrongRow({ label, selected }) @{
  <li data-selected={selected ? '1' : '0'}>{label}</li>
}
```

The conformance suite exercises this handoff with inline `.map`, keyed `@for`,
and an extracted compatibility subscriber. It asserts selected and sorted
output plus keyed DOM identity in development and production compilation.
Shallow-copying a row or forcing a render without selecting the changing value
does not create a snapshot and is intentionally unsupported in Strong mode.

## Composition with `createTableHook`

`createTableHook` is the table equivalent of TanStack Form's `createFormHook`:
declare features and reusable components once, then read the instance from
context inside them.

```tsx
export const { useAppTable, createAppColumnHelper, useCellContext } = createTableHook({
  features,
  cellComponents: { TextCell },
  tableComponents: { RowCount },
});

function TextCell() @{
  const cell = useCellContext();
  <span>{cell.getValue() as string}</span>
}

function UsersTable() @{
  const table = useAppTable({ data, columns });
  <table.AppTable>
    <table.RowCount />
    <table>
      <tbody>
        @for (const row of table.getRowModel().rows; key row.id) {
          <tr>
            @for (const c of row.getAllCells(); key c.id) {
              <table.AppCell cell={c}>
                {(cell) => <td><cell.TextCell /></td>}
              </table.AppCell>
            }
          </tr>
        }
      </tbody>
    </table>
  </table.AppTable>
}
```

## How it works

`useTable` creates the table instance once and hands table-core a
`coreReactivityFeature` binding built on TanStack Store atoms (imported through
`@octanejs/tanstack-store`, which re-exports all of `@tanstack/store`), then
synchronizes options during every render so props (`data`, `columns`, controlled
state, feature handlers) land before any read. The returned object is
re-created each render so `table.state` and `table.options` are the values read
during *that* render; the underlying instance, its store, and its atoms are
stable for the component's lifetime.

`flexRender` triages a columnDef renderer: components render through octane's
`createElement` descriptor; strings, numbers, and pre-created elements pass
through as-is. Upstream's class-component and `react.memo`/`forwardRef`
exotic-object branches are dropped — octane has no class components or
`forwardRef`, and octane's `memo()` returns a plain function.

octane keys hooks by a compiler-injected per-call-site `Symbol`, appended as the
last argument of every `use*` call. Because `useTable` and `useAppTable` end in
an *optional* `selector` parameter, both split that trailing slot off their rest
args (see `src/internal.ts`) — otherwise `useTable(options)` would read the slot
symbol as the selector.

## Not ported

Upstream's `useLegacyTable` entry — the v8-compatibility shim with `get*RowModel`
marker factories and `Legacy*` type aliases — is deliberately absent. It exists to
migrate existing React v8 codebases; octane has none, so octane code targets the
v9 `useTable` API directly.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
