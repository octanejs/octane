# @pierre/trees/react upstream ledger

`@octanejs/pierre-trees` targets the `./react` entry of `@pierre/trees@1.0.0-beta.6`
from `https://github.com/pierrecomputer/pierre.git`, package directory
`packages/trees/`.

## Immutable pin

- Package: `@pierre/trees@1.0.0-beta.6` (`latest` and `beta` on npm)
- Commit: `a90629e0481bb8fed48f36ccb358d5d48a3ae8b6` ("@pierre/trees 1.0.0-beta.6",
  2026-07-25T23:13:10Z)
- npm archive SHA-256: `2d086842ee5d51e594b816bd83f775218ccf14714b2dc1751fa494cd323c3e35`
- npm lock integrity: `sha512-zxeuSFM9TveM7b5XofweJALCtm/tGYV9HZzdbf7Uf+kBxIlUyz24/EHaGRjB0dsmmfDQl2ETz7AWwJ15lhSnpw==`
- License: Apache-2.0 (the manifest spells it `apache-2.0`). The package's
  `LICENSE.md` ships byte-exact as `LICENSE.upstream` and its `NOTICE.md` as
  `NOTICE.upstream`.

npm publishes no `gitHead`, no `repository` and no provenance for this release,
and the repository has no release tags for `@pierre/trees`, so preflight cannot
prove the identity and the lock uses pin mode, as next-themes and cmdk do. The
pinned commit is the release commit: it sets the manifest to `1.0.0-beta.6`, and
npm records the publish 90 seconds later (2026-07-25T23:14:40Z). The tarball's
source maps for `dist/react/` embed `src/react/` as `sourcesContent`, and those
bytes equal the commit's `FileTree.tsx`, `useFileTree.ts`, `useFileTreeSearch.ts`,
`useFileTreeSelection.ts` and `useFileTreeSelector.ts`.

`audit/upstream.lock.json` pins the package directory at that commit by git blob
hash, scoped to `LICENSE.md`, `NOTICE.md`, `README.md`, `package.json`,
`src/react/` and `test/file-tree-react.test.tsx`, and
`pnpm react-port:materialize run --check --package-dir packages/pierre-trees`
verifies the committed `upstream/` tree offline. The npm tarball is kept in
`upstream-artifact/`, hash-pinned by `audit/provenance.json`.

## Source boundary

- Adapted from upstream: the six modules under `upstream/src/react/`, ported one
  for one into `src/` (below). Nothing else of upstream ships.
- Reused, not copied: `@pierre/trees`, the framework-neutral core (the
  `FileTree` model, its options and payload types, and the slot constants), as a
  peer dependency at `^1.0.0-beta.6`. The core renders inside a shadow root with
  its own bundled Preact; Octane renders only the host element and its light-DOM
  slots.
- Development only, outside the published `files`: the pinned `upstream/` tree,
  the npm tarball in `upstream-artifact/`, `audit/`, `scripts/` and `tests/`.

## Source crosswalk

| Upstream | Port | Adaptation |
| --- | --- | --- |
| `src/react/FileTree.tsx` | `src/FileTree.tsrx` | Hooks and host types from `octane`; model, constants and payload types from the `@pierre/trees` root (`ContextMenuItem`/`ContextMenuOpenContext` are the root's names for the context-menu types). Octane runs no effects on the server, so `useClientLayoutEffect` is `useLayoutEffect`. Renders the literal `file-tree-container` tag. `style` stays upstream's object type, since Octane hosts also accept a string the merge cannot spread. `OctaneNode` replaces `ReactNode`. |
| `src/react/jsx.d.ts` | `src/FileTree.tsrx` | The `file-tree-container` intrinsic element, declared on Octane's JSX namespace. |
| `src/react/useFileTree.ts` | `src/useFileTree.tsrx` | Hooks from `octane`. |
| `src/react/useFileTreeSearch.ts` | `src/useFileTreeSearch.tsrx` | Hooks from `octane`. |
| `src/react/useFileTreeSelection.ts` | `src/useFileTreeSelection.tsrx` | None beyond imports. |
| `src/react/useFileTreeSelector.ts` | `src/useFileTreeSelector.tsrx` | Hooks from `octane`. |
| `src/react/index.ts` | `src/index.ts` | Same exports. |

The hooks live in `.tsrx` modules so the compiler assigns their slots. The
`"use client"` directives are dropped: Octane has no Server Components. Every
explicit dependency array is upstream's.

## Export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `FileTree` | Ported | Upstream cases, pristine and adapted; differential host-prop, model-swap and host-event cases; `tests/hydration.test.ts` |
| `useFileTree` | Ported | Upstream cases (cleanup on unmount, StrictMode replay, remount) |
| `useFileTreeSelection`, `useFileTreeSearch` | Ported | Upstream cases; differential search-action case |
| `useFileTreeSelector` | Ported | Differential equality and derived-value cases (upstream tests it only through the other hooks) |
| `FileTreeProps`, `FileTreePreloadedData`, `UseFileTreeResult`, `FileTreeSelector`, `FileTreeSelectorEquality`, `FileTreeSearchState` | Ported | `tests/types/public-api.test-d.ts` |

## Upstream tests

The pinned commit has 29 `bun test` files in `packages/trees/test/` (326
registrations). Only `file-tree-react.test.tsx` (14) tests the React entry; it is
pinned and runs in both lanes below. The other 28 test the framework-neutral core
the port imports unchanged, so they are outside the port. The Playwright suites in
`test/e2e/` (`*.pw.ts`) drive the core in a browser; one fixture,
`file-tree-demo-context-menus.tsx`, hosts the React wrapper beside a Radix
dropdown, and the adapted context-menu cases cover the same wrapper behavior.

## Behavioral oracle

- **Pristine lane** (`pierre-trees-pristine`): the pinned
  `test/file-tree-react.test.tsx` runs unchanged against the pinned `src/react/` on
  React 19.2.7, all 14 registrations. Upstream runs it with `bun test`; the lane
  runs it on Vitest, with `bun:test` aliased to `tests/bun-test.ts` (Vitest's API,
  `spyOn` from `vi`, and Bun's writable `navigator` global). `audit/pristine-suite.json`
  adds two runtime shims to the scratch tree, `src/constants.ts` and
  `src/render/FileTree.ts`, which re-export the published `@pierre/trees` core
  (the same release) where the pinned React layer imports the core's source.
- **Adapted lane** (`pierre-trees-adapted`): the same file, regenerated from the
  lock with import rewrites (`react` and `react-dom/client` to `octane`,
  `react-dom/server` to `octane/server`, `../src/react` to the port,
  `../src/render/FileTree` and `../src` to `@pierre/trees`), runs against Octane.
  One patch changes the two SSR cases: their server half renders server-compiled
  twins of the same components (`tests/_fixtures/server.tsx`). Every hydration and
  interaction assertion is upstream's.
- **Differential lane** (`pierre-trees-differential`): drives the published
  `@pierre/trees/react` (built from the pinned commit) and the port through the same
  steps for what upstream does not test (`useFileTreeSelector` equality and
  derived values, the search actions, host props and style merging, swapping
  models, and host click handlers for rows inside the shadow root), and compares
  rendered text, returned values, host attributes and model ownership after each.
- **Octane-only** (`pierre-trees`): `tests/hydration.test.ts` server-renders with no
  `window`, so `FileTree` writes the preloaded declarative shadow root, then
  hydrates it: no warnings, and the host, header and tree are adopted.
- **Upstream types**: upstream has no type tests. `tests/types/public-api.test-d.ts`
  pins the port's public types, with negative controls.

`scripts/update-audit.mjs` regenerates the committed inventories, crosswalk,
closure, and `audit/react-parity.json`.

## Updating

Move the lock to the new release with `pnpm react-port:materialize lock`, commit
the refreshed `upstream/` tree, port the `src/react/` diff, regenerate the adapted
suite, and rerun `node packages/pierre-trees/scripts/update-audit.mjs`.
