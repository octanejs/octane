# @pierre/diffs/react upstream ledger

`@octanejs/pierre-diffs` targets the `./react` entry of `@pierre/diffs@1.6.1` from
`https://github.com/pierrecomputer/pierre.git`, package directory `packages/diffs/`.

## Immutable pin

- Package: `@pierre/diffs@1.6.1`
- Tag: `diffs-v1.6.1`
- Commit: `cbc028ca863d6e662706dba87b50df3eeaebbfa7`
- npm archive SHA-256: `d098930547777226a3e25a5cb2f1b471ba91303d6f9e7626663290eb3bec352e`
- npm lock integrity: `sha512-XTfLW4bFETyosZfFNUoyRh1zPE4tmAijOoxdHx4X805tlaq/7/fuQXIiJSm21+jLkDo8vn5elQ+2O4YtMTKM0Q==`
- License: Apache-2.0 (the manifest spells it `apache-2.0`). The package's
  `LICENSE.md` is retained byte-exact as `LICENSE.upstream`; the repository has no
  NOTICE file.

npm publishes no `gitHead`, `repository` or provenance attestation for this
release, so the pin is the release tag, and these checks tie it to the tarball:

- The tag's `packages/diffs/package.json` declares `@pierre/diffs@1.6.1`.
- The tarball's `dist/react/**/*.js.map` source maps embed the content of all 20
  modules under `src/react/`, and each is byte-identical to the tag's file.
- The tarball's `LICENSE.md` has the tag's git blob hash.
- The tag commit, "chore: update @pierre/diffs to `1.6.1`" (2026-10-21 17:58:18 UTC),
  precedes the npm publish (18:05:15 UTC) by seven minutes.

`audit/upstream.lock.json` pins the package directory at that commit by git blob
hash, scoped to `src/` (the React entry and the core its tests import),
`package.json`, `LICENSE.md`, `tsconfig.json`, and the four React test files with
the three helpers they import. `pnpm react-port:materialize run --check
--package-dir packages/pierre-diffs` verifies the committed `upstream/` tree
offline.

The whole-package preflight stops at a core test it cannot count
(`test/DiffHunksRendererLanguages.test.ts`), which is outside this port: the
lock's scopes copy no core tests.

## Source boundary

- Adapted from upstream: the 23 modules under `upstream/src/react/`, ported one
  for one into `src/` (below), and the four core helpers the React layer imports
  from `@pierre/diffs` internals the package does not export, with the one module
  they import, copied into `src/core/`.
- Reused, not copied: `@pierre/diffs` itself (the `File`, `FileDiff`,
  `UnresolvedFile`, `CodeView` and `Virtualizer` classes, workers, the editor, the
  highlighter, and every exported type). It is the binding's one runtime
  dependency, pinned to 1.6.1 because the React layer calls the instances'
  `__getNextRenderData`, `__canAttachEditor` and `__prepareForEditing`.
- Development only, outside the published `files`: the pinned `upstream/` tree,
  `audit/`, `scripts/`, `tests/` and `typetests/`.

## Source crosswalk

| Upstream (`src/react/`) | Port (`src/`) | Adaptation |
| --- | --- | --- |
| `index.ts` | `index.ts` | `export * from '../types'` names the core types module's 97 types from `@pierre/diffs`, which publishes them only at its root. |
| `jsx.d.ts` | `jsx.d.ts` | Declares `diffs-container` on `octane/jsx-runtime` instead of `react`. |
| `CodeView.tsx` | `CodeView.tsrx` | `ref` is a prop instead of `forwardRef`; `createPortal` and `flushSync` come from `octane`; each portal reads its item's render data into locals before building its element, because Octane evaluates JSX props when the element renders. |
| `File.tsx`, `FileDiff.tsx`, `MultiFileDiff.tsx`, `PatchDiff.tsx`, `UnresolvedFile.tsx` | `*.tsrx` | Render `<diffs-container>` directly; `UnresolvedFileHunksRendererOptions`, which `@pierre/diffs` does not export, is declared locally. |
| `Virtualizer.tsx`, `WorkerPoolContext.tsx`, `EditContext.tsx` | `*.tsrx` | `<Context value>` for `Context.Provider`. |
| `constants.ts`, `types.ts` | same | `OctaneNode` and Octane's `CSSProperties`. |
| `utils/useFileInstance.ts`, `utils/useFileDiffInstance.ts`, `utils/useUnresolvedFileInstance.ts` | same | `useLayoutEffect(fn, null)` for `useIsomorphicLayoutEffect(fn)`: Octane runs no layout effects on the server, and `null` keeps the every-commit effect explicit. |
| `utils/useStableCallback.ts` | same | `useInsertionEffect(fn, null)` for the every-render insertion effect. |
| `utils/assignRef.ts` | same | Also forwards to each ref of an Octane ref array. |
| `utils/templateRender.tsx` | `utils/templateRender.tsrx` | `shadowrootmode` is spread, because Octane's template attributes do not declare it. |
| `utils/renderDiffChildren.tsx`, `utils/renderFileChildren.tsx` | `*.tsrx` | Imports only. |
| `utils/useForceUpdate.ts`, `utils/useNextRenderData.ts` | same | Imports only. |
| `../utils/parseMergeConflictDiffFromFile.ts`, `../utils/getHunkSideBoundaries.ts`, `../utils/getMergeConflictActionSlotName.ts`, `../utils/getCodeViewItemRenderData.ts`, `../utils/areFileTargetsEqual.ts` | `core/*.ts` | Copied; type imports point at `@pierre/diffs`. |

`src/node-timeout.d.ts` is port-authored: `@pierre/diffs` 1.6.1 declares
`ScrollSyncManager.timeoutId: NodeJS.Timeout` without depending on `@types/node`,
so a browser program (`types: []`) cannot load its declarations. The empty
interface merges with `@types/node`'s.

## Export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `CodeView`, `CodeViewHandle`, `CodeViewProps`, `ControlledCodeViewProps`, `UncontrolledCodeViewProps`, `CodeViewReactOptions`, `CodeViewAnnotationArgs`, `CodeViewItemEditCompleteHandler` | Ported | Upstream suite (both lanes); `tests/types/public-api.test-d.tsx` |
| `File`, `FileOptions`, `FileProps`, `FileEditChangeHandler`, `FileEditCompleteEvent`, `FileEditCompleteHandler` | Ported | Upstream suite; public types |
| `FileDiff`, `FileDiffProps`, `FileDiffOptions`, `DiffBasePropsReact`, `FileDiffEditChangeHandler`, `FileDiffEditCompleteEvent`, `FileDiffEditCompleteHandler`, `FileDiffMetadata` | Ported | Upstream suite; `tests/dom.test.ts`; SSR and hydration tests; public types |
| `MultiFileDiff`, `MultiFileDiffProps`, `PatchDiff`, `PatchDiffProps`, `FileContents` | Ported | Upstream suite; public types |
| `UnresolvedFile`, `UnresolvedFileProps`, `UnresolvedFileReactOptions`, `RenderMergeConflictActions`, `RenderMergeConflictActionContext`, `MergeConflictActionsTypeOption` | Ported | Upstream suite (sequential resolutions); public types |
| `Virtualizer`, `VirtualizerContext`, `useVirtualizer` | Ported | Upstream suite (virtualized cases); `tests/dom.test.ts`; SSR test |
| `WorkerPoolContext`, `WorkerPoolContextProvider`, `useWorkerPool`, `WorkerPoolOptions`, `WorkerInitializationRenderOptions` | Ported | Upstream suite (worker rendering); SSR test; public types |
| `EditContext`, `EditProvider`, `useCreateEditor`, `EditProviderProps`, `EditorFactory` | Ported | Upstream suite (editor factory lifecycle); public types |
| `renderDiffChildren`, `renderFileChildren`, `templateRender`, `useFileDiffInstance`, `useFileInstance`, `useStableCallback` | Ported | Upstream suite through the components; public types |
| `GutterUtilitySlotStyles`, `MergeConflictSlotStyles`, `noopRender` | Ported | Public types |
| The 97 types of the core `types` module | Reused from `@pierre/diffs` | Public types assert each equals `@pierre/diffs`'s |

## Behavioral oracle

- **Pristine lane** (`pierre-diffs-pristine`): the four pinned React test files
  run unchanged against the pinned source on React 19.2.7, jsdom 26.1.0 and
  shiki 4.4.1 (upstream's own versions), 84/84 registrations. Upstream runs them
  under `bun test`; this lane runs them under Vitest, with `bun:test` resolved to
  Vitest's registrars (`tests/bun-test.ts`) and `tests/bun-environment.ts`
  supplying the two Bun behaviors the suite relies on: a one-argument
  `postMessage`, and the core's shared highlighter loaded before the first render
  waits 10 ms for it.
- **Adapted lane** (`pierre-diffs-adapted`): the same files, regenerated from the
  lock, run against the port, 84/84. The core resolves to the same pinned source
  in both lanes. Rewrites point `../src/react/*` at the port, the rest of
  `../src/*` at `upstream/src`, `react` and `react-dom/client` at `octane`, and
  `WorkerPoolContext.Provider` at `WorkerPoolContext`. Three patches carry the
  only divergences, each marked `OCTANE DIVERGENCE`:
  - Octane has no `createRef`; the two files that use it define React's
    `{ current: null }`.
  - React's `act()` rethrows an error a layout effect or ref callback throws
    outside any boundary; Octane reports it to the root's `onUncaughtError`, so
    the seven cases that expect one record it there.
  - Octane's `StrictMode` does not replay mounts, so the two StrictMode cases
    expect one editor per surface instead of React's replayed pair. Their
    cleanup and no-leak assertions are upstream's.
- **Octane-only tests**: `tests/dom.test.ts` runs the port against the published
  1.6.1 dist; `tests/ssr/server.test.ts` renders through `octane/server` with no
  browser globals; `tests/hydration.test.ts` server-renders, attaches the
  declarative shadow root as a browser's parser does, and hydrates.

`scripts/update-audit.mjs` regenerates the committed inventories, crosswalk,
closure, and `audit/react-parity.json`.

## Updating

Move the lock to the new release tag with `pnpm react-port:materialize lock --pin`
(the command is in `scripts/update-audit.mjs`'s header), commit the refreshed
`upstream/` tree, port the `src/react` diff and any new core helper it imports,
regenerate the adapted suite, and rerun `node packages/pierre-diffs/scripts/update-audit.mjs`.
