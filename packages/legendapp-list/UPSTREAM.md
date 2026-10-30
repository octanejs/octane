# @legendapp/list upstream ledger

`@octanejs/legendapp-list` targets the `./react` entry of `@legendapp/list@3.3.5` from
`https://github.com/LegendApp/legend-list.git` (repository root).

## Immutable pin

- Package: `@legendapp/list@3.3.5`, entry `./react` (`react.mjs`, `react.d.ts`)
- Tag: `v3.3.5`, commit `80193ceda8f54b31e26b53f8a0ebb8cc07aa9bf0`
- npm `gitHead`: `d5a9dab3b93003c0848dda5ad78e6df1ebb59a35`
- npm integrity: `sha512-XTsLYtpg41SVb5uLBYA+YcDSA3w0tgoPq/W8ZggQ2tx+3lrC/rf+ehTP9KYHea9oFaZIuePAgzACs5/auVMJlQ==`
  (archive SHA-256 `786c21d10d1a62deeb23ed19139daa8a2c8727158f01741a5f845609f68d6b20`)
- License: MIT, © Moo.do LLC. The repository's `LICENSE` ships byte-exact as
  `LICENSE.upstream`.

npm's `gitHead` is the commit the release was built from, but its `package.json` still
says 3.3.4: upstream's publish script bumps the version while building. The `v3.3.5` tag
is that commit's only child, and changes only `CHANGELOG.md` and the version field, so
its `src/` and `__tests__/` are the `gitHead`'s byte for byte. The pin is the tag, whose
manifest names 3.3.5. `pnpm react-port:preflight` reports the 3.3.4 manifest as an
identity conflict, so the lock was made with `materialize lock --pin`.

`audit/upstream.lock.json` pins `LICENSE`, `README.md`, `package.json`, `src/`,
`__tests__/`, `tsconfig.json` and `bunfig.toml` at that commit by git blob hash, and
`pnpm react-port:materialize run --check --package-dir packages/legendapp-list` verifies
the committed `upstream/` tree offline. The npm tarball is kept in `upstream-artifact/`,
hash-pinned by `audit/provenance.json`.

## Source boundary

- Adapted from upstream: the 138 modules `src/react.ts` reaches (web resolution, type
  imports included), mirrored one for one under `src/`. Nothing else of upstream ships.
- Left out: the `./react-native`, `./animated`, `./reanimated`, `./keyboard`,
  `./keyboard-legacy` and `./section-list` entries and every `.native` module.
  `./react-native` on the web is the same `src/react.ts` bundle as `./react`.
- Not depended on: `use-sync-external-store`, upstream's one runtime dependency; the store
  hooks use Octane's own `useSyncExternalStore`. `react` and `react-dom` are test-only.
- Development only, outside the published `files`: the pinned `upstream/` tree, the
  tarball in `upstream-artifact/`, `audit/`, `scripts/` and `tests/`.

## Source crosswalk

Every upstream path keeps its place under `src/`. Imports point at the sibling file with
its extension instead of the `@/` alias, and the code is in the repository's format. 95
modules have no other change: the list's state machine (`core/`), its utilities
(`utils/`, apart from the four below) and the web platform shims. Components are `.tsrx`;
everything else stays `.ts`.

| Upstream | Port | Adaptation |
| --- | --- | --- |
| `components/LegendList.tsx` | `components/LegendList.tsrx` | Hooks, `Children`, `cloneElement` from `octane`. The ref arrives as a prop and is kept off the scroll view. The every-commit `useLayoutEffect(runPendingScrollToEnd)` passes `null`, because Octane infers an omitted dependency array. |
| `components/ListComponent.tsx` | `components/ListComponent.tsrx` | Header, empty, footer and spacer branches are `@if` arms. |
| `components/ListComponentScrollView.tsx` | `components/ListComponentScrollView.tsrx` | `ref` prop instead of `forwardRef`; snap anchors are a keyed `@for`. |
| `components/Containers.tsx` | `components/Containers.tsrx` | The slots render in `useDOMOrder`'s order through a keyed `@for` (see divergences). |
| `components/Container.tsx` | `components/Container.tsrx` | `<ContextContainer value>`; the separator is an `@if` arm. |
| `components/PositionView.tsx` | `components/PositionView.tsrx` | Children render as the element's content instead of riding the prop spread. |
| `components/ContainerSlot.tsx`, `ContainerLayoutCoordinator.tsx`, `Separator.tsx`, `ScrollAdjust.tsx`, `SnapWrapper.tsx`, `DebugView.tsx` | `.tsrx` | Hooks and types from `octane`; `SnapWrapper` forwards `ref` as a prop. |
| `components/DevNumbers.tsx` | `components/DevNumbers.tsrx` | Upstream returns a memo component cast to an element, which React cannot render; it only mounts when `ENABLE_DEVMODE` is switched on in source. The port renders the offset ruler that code describes. |
| `hooks/useDOMOrder.ts` | `hooks/useDOMOrder.ts` | Returns the debounced order instead of moving elements (see divergences). |
| `hooks/useCombinedRef.ts` | `hooks/useCombinedRef.ts` | Also assigns through Octane's array refs (`ref={[a, b]}`). |
| `hooks/useStableRenderComponent.tsx` | `hooks/useStableRenderComponent.ts` | The stable component reads `props.ref` instead of using `forwardRef`. |
| `hooks/useContainerMeasurement.tsx`, `hooks/useOnLayoutSync.tsx` | `.ts` | Hooks from `octane`; the every-commit `useLayoutEffect` passes `null`. |
| `state/state.tsx` | `state/state.ts` | `StateProvider` renders `createElement(ContextState, { value }, children)`; `useSyncExternalStore` from `octane`. |
| `types.internal.ts` | `types.internal.ts` | `typedForwardRef` hands `props.ref` to its render function; `typedMemo` is Octane's `memo`. |
| `types.base.ts`, `types.web.ts`, `platform/scrollview-types.ts` | same | `OctaneNode`, `OctaneElement`, `ComponentType`, `Ref` from `octane`. |
| `platform/batchedUpdates.ts`, `platform/flushSync.ts` | same | `unstable_batchedUpdates` and `flushSync` from `octane`. |
| `utils/getComponent.tsx` | `utils/getComponent.ts` | `createElement` and `isValidElement` from `octane`. |
| `utils/devEnvironment.ts` | same | Declares `process` for consumers without Node types. |
| `react.ts` | `react.ts` | `LegendList` carries the `descriptorChildren` marker, so children mode can read its children with `Children.toArray`. |
| the remaining hooks, `ContextContainer.ts`, `useWrapIfItem.ts`, `getRenderedItem.ts`, `useRafCoalescer.ts`, `useDevChecks.ts`, `platform/Animated.tsx`, `RefreshControl.tsx`, `StyleSheet.tsx`, `LayoutView.tsx`, `ViewComponents.tsx` | same paths | Hooks and types from `octane`; the views take `ref` as a prop. |

`utils/reordering.ts` (upstream's DOM sort) is kept with its pinned tests but no longer
called.

## Export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `LegendList` | Ported | Chromium differential, SSR differential |
| `useRecyclingState`, `useRecyclingEffect`, `useViewability`, `useIsLastItem`, `useListScrollSize` | Ported | Chromium differential (`row-hooks`) |
| `useViewabilityAmount`, `useSyncLayout`, `useAdaptiveRender`, `useAdaptiveRenderChange` | Ported | `tests/types/public-api.test-d.tsx`; the code under them runs in the adapted lane |
| `internal` | Ported | Runtime export of upstream's `react.mjs` (its declaration is stripped upstream); typed here |
| The 36 exported types | Ported | `tests/types/public-api.test-d.tsx` |

## Behavioral oracle

- **Pristine lane** (`legendapp-list-pristine`): 84 of the pinned suites run unchanged
  against the pinned source on React 19, 1,348 registrations. Upstream runs its suite with
  `bun test`, which the repository does not use. `bun:test` maps onto Vitest
  (`tests/bun/bun-test.ts`). The pinned `__tests__/setup.ts` is preloaded as bunfig does.
  Its React Native entry-point table is applied by resolved path, as bun's `mock.module`
  applies it. Its `@testing-library/react-native` helpers run over `react-test-renderer`,
  which they wrap.
- **Adapted lane** (`legendapp-list-adapted`): the 68 suites that need no renderer run
  against this package's source, 1,255 registrations, under the same harness. The lock's
  only rewrite points `../../src/` at the package. Two native-only suites
  (`doScrollTo.native`, `measureContainersInLayoutEffect.native`) stay in the pristine
  lane.
- **Chromium differential** (`legendapp-list-browser`): one `.tsrx` fixture runs through this
  package on Octane and through `@legendapp/list/react@3.3.5` (compiled with `@tsrx/react`)
  on React 19. Each step goes to both pages, and they must agree once settled: scroll
  geometry, the rows mounted inside the buffered window and their offsets, DOM order after
  the reorder, rows left over from removed data, snap anchors, `getState()` and the callback
  log. The scenarios follow T3 Code's uses: its chat timeline, pickers, restored work log and
  anchored end space.
- **SSR differential** (`legendapp-list-ssr`): six prop sets render through `octane/server`
  and through `react-dom/server`, and the markup matches.

## Upstream test crosswalk

`audit/crosswalk.json` classifies all 1,565 pinned registrations:

- 1,249 `implemented`: they run in both upstream lanes.
- 68 `conformance`: suites that render through `react-test-renderer`. They run unchanged
  in the pristine lane; the components they render run in the Chromium differential.
- 80 `inapplicable`: React Native variants, the other entries (keyboard, reanimated,
  section-list) and upstream's example app.
- 168 `unsupported`: suites that need bun's `mock.module`, which rebinds modules other
  modules already imported, or that spy on ES module exports. Vitest can do neither.
  These are mostly LegendList-level tests through mocked children; the Chromium
  differential drives the same props end to end against the published package instead.

## Divergences

- **DOM order** (`dom-order`). Upstream moves the row elements with `insertBefore` 500ms
  after the last position change. Octane tracks each component's DOM as a range between
  comment markers, and an element moved behind its back leaves its ranges. With upstream's
  mechanism, removing rows after a reorder left an orphaned row in the DOM in the Chromium
  differential. The port renders the slots in the same debounced order and Octane moves the
  elements. DOM order is the same; effects in different rows run in DOM order after a
  reorder instead of slot order.

Children mode passes upstream's `childrenMode` prop through to the scroll element, so React
and Octane both warn about an unknown DOM prop in development; the port keeps that.
