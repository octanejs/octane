# Upstream

- Package: `@tanstack/react-query-devtools@5.102.8`
- Repository: https://github.com/TanStack/query
- Release tag: `@tanstack/react-query-devtools@5.102.8`, which resolves to commit
  `2969edf32f7e0c48e2a108d84712d6e01edfde21`. npm publishes no `gitHead` for this
  release, so the commit comes from the signed npm provenance and the release tag; it is
  the same commit `@octanejs/tanstack-query` pins for `@tanstack/react-query@5.102.8`.
- Source and tests: `packages/react-query-devtools/src`, including `src/__tests__`
- License: MIT; exact upstream text ships as `LICENSE.upstream`.

## Source boundary

`audit/upstream.lock.json` pins every regular file in the package subtree that is not a
monorepo configuration symlink. `upstream/` is byte-exact, unpublished evidence.
`tests/upstream/` is regenerated from the lock's import rewrites; no divergence patch is
needed because the two upstream test files run unmodified apart from import repointing.

The framework-neutral `@tanstack/query-devtools@5.102.8` (a self-contained Solid bundle with
no React import) is reused unchanged as a dependency. The query client, `onlineManager`
and `useQueryClient` come from `@octanejs/tanstack-query`.

## Export crosswalk

| Upstream export (`@tanstack/react-query-devtools`) | Disposition |
| --- | --- |
| `ReactQueryDevtools` | ported (`src/ReactQueryDevtools.tsrx`) |
| `ReactQueryDevtoolsPanel` | ported (`src/ReactQueryDevtoolsPanel.tsrx`) |
| `DevtoolsPanelOptions` (type) | ported |
| `./production` entry: `ReactQueryDevtools`, `ReactQueryDevtoolsPanel` | ported (`src/production.ts`) |

The development-only switch in `src/index.ts` mirrors upstream.

## Divergences

- Hooks come from `octane`; `useRef` is typed `HTMLDivElement | null` as Octane requires.
- The core instance is built in a lazy `useState` initializer (upstream passes an eagerly
  constructed instance, discarded on every re-render after the first). Observable
  behavior is otherwise identical; the upstream suite has no constructor-count assertion.
- Element construction is authored in `.tsrx`; `className` is written `class`.
- `CSSProperties` and `OctaneNode` replace `React.CSSProperties` and `React.ReactElement`.

## Behavioral oracle

All 37 upstream registrations run unchanged against real React (`tanstack-query-devtools-pristine`)
and, with import rewrites only, against Octane (`tanstack-query-devtools-adapted`).
Octane-only conformance and SSR tests live under `tests/conformance` and `tests/ssr`.
