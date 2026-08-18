# TanStack DB (React) upstream

`@octanejs/tanstack-db` ports the React-facing live-query binding surface of
[`@tanstack/react-db@0.1.96`](https://github.com/TanStack/db) — `useLiveQuery`,
`useLiveSuspenseQuery`, `useLiveInfiniteQuery`, `useLiveQueryEffect`, and
`usePacedMutations` — onto Octane hooks, and reuses the framework-neutral
`@tanstack/db@0.7.0` core verbatim (re-exported unchanged). `@tanstack/react-db`
is itself a thin React adapter over `@tanstack/db`; this package is the Octane
adapter over the same core, so the two adapters read side by side under
`upstream/react-db/src` and `src`.

## Immutable pin

- Package: `@tanstack/react-db@0.1.96` (adapter) over `@tanstack/db@0.7.0` (core)
- Repository: `https://github.com/TanStack/db.git`
- Release tag: `@tanstack/react-db@0.1.96` (the npm artifact does not embed a
  `gitHead`; the pin is by version + integrity below)
- Source root: `src` (adapter); core is consumed from the published
  `@tanstack/db` package, not vendored
- Test root: `packages/react-db/tests` in the repository (NOT published in the
  npm artifact — see the suite disposition)
- License: MIT (vendored at `upstream/react-db/LICENSE`)
- npm archive SHA-256 (`@tanstack/react-db@0.1.96`):
  `2c9f6022aab930ada80d82fdadef6c7ec23bcd42b2e776c44f1806e70b7a228c`
- npm integrity (`@tanstack/react-db@0.1.96`):
  `sha512-NIjRiFH9KqNnWRtixFal22KA+9b2ktBxI7TbW7xIVa2/sKOHSxFcPAkz6HEC3V7O9PfDTh3j8aezj02CxjHrLw==`
- npm integrity (`@tanstack/db@0.7.0`):
  `sha512-ZQns5TIWb0m6PEIf4c2vU7NyFq+QgMuL7zIo70243NSEbLPtd7hd86t3ksm/H3ozwcuCb7vL14BHt/OxNyPQGA==`
- Supported upstream range: `@tanstack/db@^0.7.0`
- React oracle: `@tanstack/react-db@0.1.96` on `react`/`react-dom` (the upstream
  adapter this port mirrors)

## Public surface crosswalk

Every export of the pinned `@tanstack/react-db` root entry:

| Upstream export | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `useLiveQuery` | Ported | Rebuilt on `createLiveQueryObserver` (db #1642) + Octane `useSyncExternalStore`. `tests/useLiveQuery.test.tsx`, the conformance suite, and `typetests/useLiveQuery.test-d.tsx`. |
| `useLiveSuspenseQuery` | Ported with divergence | Suspends via Octane `use(thenable)` instead of `throw promise` (see divergences). `tests/useLiveSuspenseQuery.test.tsx`, incl. the async-fallback regression. |
| `useLiveInfiniteQuery` | Ported | Rebuilt on `createLiveQueryWindowController` (db #1675) for coordinated window leases + rollback. `tests/useLiveInfiniteQuery.test.tsx`, incl. the shared-window regression. |
| `useLiveQueryEffect` | Ported | `createEffect` bridged through an Octane passive effect. `tests/useLiveQueryEffect.test.tsx`. |
| `usePacedMutations` | Ported | `createPacedMutations` bridged. `tests/usePacedMutations.test.tsx`. |
| `Collection` (explicit type re-export) | Reused verbatim | Re-exported from `@tanstack/db`; `src/index.ts`. |
| `createTransaction` (explicit re-export) | Reused verbatim | Re-exported from `@tanstack/db`; `src/index.ts`. |
| `export * from '@tanstack/db'` | Reused verbatim (framework-neutral core) | The entire `@tanstack/db` public surface is re-exported unchanged; the core is not re-implemented. |

## Upstream suite disposition

The `@tanstack/react-db` npm artifact ships no tests. The upstream runtime and
type suites live in `packages/react-db/tests` of the TanStack/db repository and
have NOT been vendored or adapted one-for-one; the port instead runs the shared
`@tanstack/db` live-query conformance suite against the Octane adapter plus
local hook coverage. Their disposition:

| Pinned artifact (repo `packages/react-db/tests`) | Current disposition |
| --- | --- |
| `useLiveQuery.test.tsx` | Not adapted one-for-one; local `tests/useLiveQuery.test.tsx` + shared conformance suite cover the equivalent behavior. |
| `useLiveInfiniteQuery.test.tsx` | Not adapted one-for-one; local `tests/useLiveInfiniteQuery.test.tsx` covers pagination, coordinated windows, and the orderBy requirement. |
| `useLiveSuspenseQuery.test.tsx` | Not adapted one-for-one; local `tests/useLiveSuspenseQuery.test.tsx` covers suspend/fallback (async), error, and stale-while-revalidate. |
| `useLiveQueryEffect.test.tsx` | Not adapted one-for-one; local `tests/useLiveQueryEffect.test.tsx` covers create/dispose/deps. |
| `usePacedMutations.test.tsx` | Not adapted one-for-one; local `tests/usePacedMutations.test.tsx`. |
| Upstream type tests (`*.test-d.tsx`) | Not adapted one-for-one; local `typetests/useLiveQuery.test-d.tsx` covers the overload families. Exhaustive type parity remains open. |

## Bounded evidence

The shared `@tanstack/db` live-query conformance suite
(`tests/db-fixtures/conformance`) runs against the Octane adapter driver
(`tests/conformance.test.tsx`) with zero known gaps and zero universal
expected-fails after the 0.7.0 order-only-move fix (db #1669). This exercises the
query/liveness/ordering/error surface the adapter is responsible for. It does not
establish exhaustive parity for the Suspense, infinite-query, effect, paced, or
type surfaces, and there is no executable React-differential lane yet; both
remain open.
