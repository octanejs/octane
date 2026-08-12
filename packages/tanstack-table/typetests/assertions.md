# Type parity assertions

`@tanstack/react-table@9.0.0-beta.58` ships no dedicated type-test suite (its
typecheck only compiles package source), so both sides of this lane are
port-authored. The two files assert the SAME public-surface claims, one against
the published React binding compiled with `tsc`, one against
`@octanejs/tanstack-table` compiled with `tsrx-tsc`.

`scripts/react-parity/tanstack-table-types-lib.mjs` hashes per-file assertion
groups (numbered headings, `Expect` pins, and `@ts-expect-error` controls),
enforces the permitted transformations structurally, and rejects a skipped
file, deleted group, or removed negative control. Regenerate inventories with
`node scripts/react-parity/tanstack-table-types.mjs --write`.

Permitted differences between the two files, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import root `@tanstack/react-table` → `@octanejs/tanstack-table` | the package under test |

The `./legacy` / `useLegacyTable` omission is authenticated by the ordinary
`parity-legacy-api` package-export observation (`adapted:tanstack-table-legacy-subpath`),
not by these paired type probes.

Every assertion group below appears in both files under the same heading.

1. `useTable` accepts features, data, and columns and returns a typed table.
2. A selector overload preserves `TableState` inference.
3. `createColumnHelper` is a callable helper factory.
4. `flexRender` is a callable render helper.
5. `createTableHookContexts` exposes `useTableContext`.
6. `useTable` rejects an unknown option key.
