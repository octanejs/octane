# @octanejs/tanstack-table

[TanStack Table](https://tanstack.com/table) for the [octane](https://github.com/octanejs/octane) UI framework.

TanStack Table separates a framework-agnostic core (`@tanstack/table-core`:
`createTable` plus every feature row model — sorting, filtering, pagination,
selection, visibility, expanding, grouping, faceting, …) from a ~100-line React
adapter (`useReactTable` + `flexRender`). This package reuses the core
unchanged (re-exported verbatim) and transcribes only the adapter onto octane's
hooks, preserving upstream's exact `useState`-based state wiring. The public
surface matches `@tanstack/react-table` 1:1 — existing code works by changing
the import.

```tsx
// before
import { useReactTable, flexRender, getCoreRowModel } from '@tanstack/react-table';
// after
import { useReactTable, flexRender, getCoreRowModel } from '@octanejs/tanstack-table';

function People() @{
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
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
          @for (const cell of row.getVisibleCells(); key cell.id) {
            <td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
          }
        </tr>
      }
    </tbody>
  </table>
}
```

## Entry points

| import | what you get | notes |
| --- | --- | --- |
| `@octanejs/tanstack-table` | everything `@tanstack/table-core` exports + `useReactTable`, `flexRender`, `Renderable` | core verbatim + the octane-bound adapter (single entry, mirroring upstream) |

## How it works

`useReactTable` is a line-for-line transcription of the upstream adapter: the
table instance is created once, its state lives in a `useState` whose setter is
wired into `onStateChange`, and options are re-composed into the instance
during every render — so partially-controlled state (`state.sorting` +
`onSortingChange`), full `onStateChange` passthrough, and table-core's
functional `Updater<T>` contract behave exactly as on React.

`flexRender` triages a columnDef renderer: components render through octane's
`createElement` descriptor at value position; strings, numbers, and pre-created
elements pass through as-is. Upstream's class-component and
`react.memo`/`forwardRef` exotic-object branches are dropped — octane has no
class components or `forwardRef`, and octane's `memo()` returns a plain
function, so `typeof === 'function'` covers every component.

octane keys hooks by a compiler-injected per-call-site `Symbol`, appended as
the last argument of every `use*` call. `useReactTable` forwards that slot into
its composed hooks, so two tables in one component stay independent, exactly
like in React.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
