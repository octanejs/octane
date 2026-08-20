# react-window upstream contract

## Immutable pin

| Field | Value |
| --- | --- |
| Package | `react-window` |
| Version | `2.3.0` |
| Repository | `https://github.com/bvaughn/react-window.git` |
| Annotated tag | `2.3.0` (`c8f17487…`) |
| Dereferenced tag commit | `4d9eebbb510262b3b7e95463cf49a10de53ea77d` |
| npm integrity | `sha512-FW6TIpaOH646k51X7yE+LSCWGkt5Pfsnc1fVyq/sCI9h0pTqmMiBXM04pzFKg3Bt7NGkeV6kqbU8d/QjmFS7Ug==` |
| npm shasum | `92fefee75b7de56a31204dfffc492b84136e4783` |
| npm tarball SHA-256 | `c62b0568794a8cf5f523fa6fd68f83261cfdc9bb7578e918ca2ae1181fc44623` |
| Canonical tag archive SHA-256 | `d0b66c0138c6355051a75086ce0681aa5880249c0d14f1e9759185daee16e452` |
| License | MIT, copyright Brian Vaughn |

The byte-exact tagged tree (the `lib/` sources and tests, repository package
metadata, Vitest setup, and license) is vendored under `upstream/` and verifies
offline against the upstream git blob shas recorded in
`audit/upstream.lock.json`. The published npm declaration bundle is vendored
under `upstream-artifact/`, hash-pinned by `audit/upstream-contract.json`. The
pinned license is republished at the package root as `LICENSE.upstream`. All of
it is audit input only and must remain excluded from the published package.

Run `pnpm --dir packages/window upstream:verify` to verify the lock-pinned tree
and all 57 vendored artifacts, the exact file set, the published declaration
bundle, the 14 upstream test artifacts and their 117 test registrations, package
metadata, and the complete root export inventory.

## Public v2.3.0 surface

Runtime exports: `Grid`, `List`, `getScrollbarSize`, `useDynamicRowHeight`,
`useGridCallbackRef`, `useGridRef`, `useListCallbackRef`, and `useListRef`.

Type exports: `Align`, `CellComponentProps`, `DynamicRowHeight`,
`GridImperativeAPI`, `GridProps`, `ListImperativeAPI`, `ListProps`, and
`RowComponentProps`.

The v1 `FixedSizeList`, `VariableSizeList`, `FixedSizeGrid`, and
`VariableSizeGrid` names are not part of this pin and are intentionally outside
the binding contract.

## Source boundary and module disposition

The immutable boundary is every file under upstream `lib/`, plus `src/constants.ts`,
`vitest.setup.js`, `package.json`, and the MIT license. Production modules are
ported source-correspondently under `src/`; test modules are either executed
byte-exact in the pristine lane or regenerated into `tests/upstream/`
(gitignored) from the lock's mechanical `adaptedRewrites` plus the two
committed divergence patches under `audit/upstream-patches/`, with the
transformation classifications documented in
`audit/adapted-transformations.json`. No vendored file is published.

| Upstream module class | Octane disposition | Evidence |
| --- | --- | --- |
| `lib/components/**`, `lib/core/**`, `lib/hooks/**`, `lib/utils/**` production files | Source-correspondent port in `src/**`; React imports and renderer syntax are the only framework adaptations | `audit/adapted-transformations.json`, `tests/audit/adapted.test.mjs` |
| `lib/**/*.test.{ts,tsx}` | Unchanged pristine execution and generated adapted execution | `audit/pristine-runtime.json`, `audit/adapted-runtime.json` |
| `lib/utils/test/**`, `vitest.setup.js` | Unchanged pristine support; source-correspondent adapted support | `audit/upstream.lock.json` (adapted mapping and rewrites) |
| Published declaration bundle | Unchanged pristine oracle; identical shared assertion program targets Octane source | `audit/type-contract.json`, `typetests/**` |
| Repository metadata and license | Vendored provenance only | `tests/audit/upstream.test.mjs` |

## Export crosswalk

| Public export | Kind | Classification | Octane evidence |
| --- | --- | --- | --- |
| `Grid` | runtime | Exact component port | upstream Grid suites, runtime, differential, SSR, hydration |
| `List` | runtime | Exact component port | upstream List suites, runtime, differential, SSR, hydration |
| `getScrollbarSize` | runtime | Source-identical utility | upstream inventory and shared type contract |
| `useDynamicRowHeight` | runtime | Exact hook port with compiler-slot plumbing | upstream hook suite, runtime dynamic-height suite |
| `useGridCallbackRef` | runtime | Exact public React hook signature; Octane state slot internally | shared types and grid initializer runtime case |
| `useGridRef` | runtime | Exact public React hook signature; Octane ref slot internally | shared types and grid initializer runtime case |
| `useListCallbackRef` | runtime | Exact public React hook signature; Octane state slot internally | shared types and list initializer runtime case |
| `useListRef` | runtime | Exact public React hook signature; Octane ref slot internally | shared types and list initializer runtime case |
| `Align` | type | Exact published declaration | shared type contract group `utilities` |
| `CellComponentProps` | type | Exact published declaration | shared type contract group `component-props` |
| `DynamicRowHeight` | type | Exact published declaration | shared type contract group `dynamic-height` |
| `GridImperativeAPI` | type | Exact published declaration | shared type contract groups `ref-hooks`, `imperative-api` |
| `GridProps` | type | Exact published declaration | shared type contract groups `list-grid-props`, `forbidden-generated-props` |
| `ListImperativeAPI` | type | Exact published declaration | shared type contract groups `ref-hooks`, `imperative-api` |
| `ListProps` | type | Exact published declaration | shared type contract groups `list-grid-props`, `forbidden-generated-props` |
| `RowComponentProps` | type | Exact published declaration | shared type contract group `component-props` |

## Upstream test crosswalk

Every row runs unchanged in `react-window-pristine` and as a lock-regenerated
adaptation in `react-window-adapted`; the inventories prove all 117
registered cases are unique and executed.

| Upstream test file | Pristine disposition | Adapted disposition |
| --- | --- | --- |
| `components/grid/Grid.test.tsx` | byte-exact | regenerated framework adaptation |
| `components/list/List.test.tsx` | byte-exact | regenerated framework adaptation |
| `components/list/useDynamicRowHeight.test.ts` | byte-exact | regenerated framework adaptation |
| `core/createCachedBounds.test.ts` | byte-exact | regenerated import adaptation |
| `core/getEstimatedSize.test.ts` | byte-exact | regenerated import adaptation |
| `core/getOffsetForIndex.test.ts` | byte-exact | regenerated import adaptation |
| `core/getStartStopIndices.test.ts` | byte-exact | regenerated import adaptation |
| `core/useCachedBounds.test.ts` | byte-exact | regenerated hook adaptation |
| `core/useVirtualizer.test.ts` | byte-exact | regenerated hook adaptation |
| `hooks/useMemoizedObject.test.ts` | byte-exact | regenerated hook adaptation |
| `hooks/useResizeObserver.test.ts` | byte-exact | regenerated hook adaptation |
| `hooks/useStableCallback.test.tsx` | byte-exact | regenerated hook adaptation |
| `utils/parseNumericStyleValue.test.ts` | byte-exact | regenerated import adaptation |
| `utils/shallowCompare.test.ts` | byte-exact | regenerated import adaptation |

## Port-authored evidence crosswalk

| Authored evidence | Classification | React-to-Octane pairing / citation |
| --- | --- | --- |
| `tests/runtime/{grid,list,dynamic-height}.test.ts` | Adapted consumer behavior | Supplements the exact upstream suites with Octane-native DOM, imperative API, initializer, and measurement coverage |
| `tests/differential/parity.test.ts` | Differential | One shared TSX fixture is compiled for React and Octane; the rig compares serialized DOM after native scrolling |
| `tests/ssr/ssr.test.ts` | Adapted SSR | Exercises the same public `List`/`Grid` defaults pinned by the declaration and upstream component suites |
| `tests/hydration.test.ts` | Adapted hydration | Adopts nodes emitted by the SSR fixture, then proves live ResizeObserver and scrolling behavior |
| `typetests/parity.test-d.ts` | Paired type oracle | Identical assertion groups compile against the npm declaration and Octane source; `audit/type-contract.json` forbids source transforms |
| `typetests/negative/missing-coordinate.test-d.ts` | Paired negative type control | Both compilers reject the same incomplete Grid coordinate |
| `tests/audit/upstream.test.mjs` | Provenance audit | Pins the exact file/export/test inventory in both directions |
| `tests/audit/adapted.test.mjs` | Adaptation audit | Regenerates and byte-compares every adapted upstream test/source mapping with mutation controls |
| `tests/audit/types.test.mjs` | Type-evidence audit | Accounts for every assertion group and proves skipped/deleted/unauthorized mutations fail |
| `tests/feasibility/renderer-boundary.test.ts` | Framework-boundary characterization | Documents the two reviewed renderer ABI/scheduling divergences recorded in the manifest |
