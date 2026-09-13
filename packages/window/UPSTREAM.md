# react-window upstream contract

## Immutable pin

| Field | Value |
| --- | --- |
| Package | `react-window` |
| Version | `2.3.1` |
| Repository | `https://github.com/bvaughn/react-window.git` |
| Pinned source commit | `eb7398fdc0e9d9b54560142caa2f6461474e0014` |
| npm integrity | `sha512-x/+N6b7FNVtlKE7ZQlfOY2bYdA7VXvT2B1Emo/ndAsFsSQ98FBIO88MsatNELbSIlYJgkCd7unBps5XMfv0Eyg==` |
| npm shasum | `92fd42d7a3704644f56f31a4e829ab74f87126f5` |
| npm tarball SHA-256 | `44ff692f9d49c32cd6b8306b164bba7d0029f58437708cc832414ecb5ebc7ee6` |
| License | MIT, copyright Brian Vaughn |

The byte-exact pinned tree (the `lib/` sources and tests, repository package
metadata, Vitest setup, and license) is vendored under `upstream/` and verifies
offline against the upstream git blob shas recorded in
`audit/upstream.lock.json`. The published npm declaration bundle is vendored
under `upstream-artifact/`, hash-pinned by `audit/upstream-contract.json`. The
pinned license is republished at the package root as `LICENSE.upstream`. All of
it is audit input only and must remain excluded from the published package.

Run `pnpm --dir packages/window upstream:verify` to verify the lock-pinned tree
and all 59 vendored artifacts, the exact file set, the published declaration
bundle, the 15 upstream unit test artifacts and their 119 test registrations, package
metadata, and the complete root export inventory.

## Public v2.3.1 surface

Runtime exports: `Grid`, `List`, `getScrollbarSize`, `useDynamicRowHeight`,
`useGridCallbackRef`, `useGridRef`, `useListCallbackRef`, and `useListRef`.

Type exports: `Align`, `CellComponentProps`, `DynamicRowHeight`,
`GridImperativeAPI`, `GridProps`, `ListImperativeAPI`, `ListProps`, and
`RowComponentProps`.

The v1 `FixedSizeList`, `VariableSizeList`, `FixedSizeGrid`, and
`VariableSizeGrid` names are not part of this pin and are intentionally outside
the binding contract.

## Source boundary

The immutable boundary is every file under upstream `lib/`, plus the six-case browser layout-shift specification, `src/constants.ts`,
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
adaptation in `react-window-adapted`; the inventories prove all 119
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
| `core/useIsRtl.test.ts` | byte-exact | regenerated hook adaptation |
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

## Browser conformance

The complete preflight inventory has 125 registrations. All 119 unit cases run
in both pinned React and generated Octane lanes. Four upstream layout-shift
scenarios have native Chromium conformance in
`tests/browser/window.browser.test.ts`: List and Grid client startup and SSR
hydration retain the expected initial visible item counts, produce no cumulative
layout shift, and preserve bounded rendering after scrolling. Hydration also
checks that existing server item nodes are adopted. A fifth browser case verifies
that a mounted Grid switches imperative scrolling between LTR and RTL.

The two upstream React Server Components application scenarios are inapplicable:
Octane does not implement Server Components. `audit/crosswalk.json` records all
125 immutable identities and their individual dispositions. Browser evidence is
Chromium-specific; the legacy Firefox readiness note is not a claim of Firefox
coverage.
