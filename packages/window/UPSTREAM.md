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

The byte-exact tagged `lib/` tree, published npm declaration bundle, repository
package metadata, and license are vendored under `upstream/` for provenance and
must remain excluded from the published package.

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

| Upstream module class | Octane disposition | Evidence |
| --- | --- | --- |
| `lib/utils/test/**`, `vitest.setup.js` | Unchanged pristine support; source-correspondent adapted support | `upstream/SHA256SUMS`, `tests/generate-adapted-tests.mjs` |

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

The adapted suite is generated from these upstream files and runs in the
`window-adapted` project.

| Upstream test file | Upstream source | Adapted disposition |
| --- | --- | --- |
| `components/grid/Grid.test.tsx` | byte-exact | generated framework adaptation |
| `components/list/List.test.tsx` | byte-exact | generated framework adaptation |
| `components/list/useDynamicRowHeight.test.ts` | byte-exact | generated framework adaptation |
| `core/createCachedBounds.test.ts` | byte-exact | generated import adaptation |
| `core/getEstimatedSize.test.ts` | byte-exact | generated import adaptation |
| `core/getOffsetForIndex.test.ts` | byte-exact | generated import adaptation |
| `core/getStartStopIndices.test.ts` | byte-exact | generated import adaptation |
| `core/useCachedBounds.test.ts` | byte-exact | generated hook adaptation |
| `core/useVirtualizer.test.ts` | byte-exact | generated hook adaptation |
| `hooks/useMemoizedObject.test.ts` | byte-exact | generated hook adaptation |
| `hooks/useResizeObserver.test.ts` | byte-exact | generated hook adaptation |
| `hooks/useStableCallback.test.tsx` | byte-exact | generated hook adaptation |
| `utils/parseNumericStyleValue.test.ts` | byte-exact | generated import adaptation |
| `utils/shallowCompare.test.ts` | byte-exact | generated import adaptation |

## Port-authored evidence crosswalk

| Authored evidence | Classification | React-to-Octane pairing / citation |
| --- | --- | --- |
| `tests/runtime/{grid,list,dynamic-height}.test.ts` | Adapted consumer behavior | Supplements the exact upstream suites with Octane-native DOM, imperative API, initializer, and measurement coverage |
| `tests/differential/parity.test.ts` | Differential | One shared TSX fixture is compiled for React and Octane; the rig compares serialized DOM after native scrolling |
| `tests/ssr/ssr.test.ts` | Adapted SSR | Exercises the same public `List`/`Grid` defaults pinned by the declaration and upstream component suites |
| `tests/hydration.test.ts` | Adapted hydration | Adopts nodes emitted by the SSR fixture, then proves live ResizeObserver and scrolling behavior |
| `tests/feasibility/renderer-boundary.test.ts` | Framework-boundary characterization | Documents the two reviewed renderer ABI/scheduling divergences recorded in the manifest |
