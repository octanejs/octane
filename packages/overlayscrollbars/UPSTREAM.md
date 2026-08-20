# Upstream provenance

`@octanejs/overlayscrollbars` ports the React binding of
[`overlayscrollbars-react@0.5.6`](https://github.com/KingSora/OverlayScrollbars).

## Immutable pin

- Package: `overlayscrollbars-react@0.5.6`
- License: MIT
- Repository: `https://github.com/KingSora/OverlayScrollbars.git`
- Tag: none for the React package; npm `gitHead` / recorded commit: `e0ad5d026909b85d10e9ed0f7605cddd067408c9`
- Advertised range: exactly `0.5.6`
- npm integrity: `sha512-E5To04bL5brn9GVCZ36SnfGanxa2I2MDkWoa4Cjo5wol7l+diAgi4DBc983V7l2nOk/OLJ6Feg4kySspQEGDBw==`
- Peer: `overlayscrollbars@^2` — development pin `overlayscrollbars@2.16.0` (MIT). The vanilla core is reused as an npm dependency and is not vendored.

## Source boundary

- Canonical repository sources and tests: `packages/overlayscrollbars/upstream/canonical/`
- Published npm artifact: `packages/overlayscrollbars/upstream/npm/`
- Octane modules mirror `upstream/canonical/src/` one-for-one.
- `overlayscrollbars` stays an external peer. Only the React-facing hook and component are reimplemented on Octane hooks/`createElement`.

Neither `upstream/` tree is included in the published package.

## Export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `OverlayScrollbarsComponent` | Ported; refs-as-props, no `forwardRef`; dynamic `element` via `createElement` | `tests/OverlayScrollbarsComponent.test.ts` |
| `OverlayScrollbarsComponentProps` | Ported; `children` is `OctaneNode` | `src/OverlayScrollbarsComponent.ts` |
| `OverlayScrollbarsComponentRef` | Ported (`osInstance`, `getElement`) | `tests/OverlayScrollbarsComponent.test.ts` |
| `useOverlayScrollbars` | Ported with manual hook slots | `tests/useOverlayScrollbars.test.ts` |
| `UseOverlayScrollbarsParams` / `UseOverlayScrollbarsInitialization` / `UseOverlayScrollbarsInstance` | Ported types | `src/useOverlayScrollbars.ts` |

## Test-suite disposition

| Upstream artifact | Disposition | Evidence |
| --- | --- | --- |
| `test/useOverlayScrollbars.test.tsx` | Ported | `tests/useOverlayScrollbars.test.ts` |
| `test/OverlayScrollbarsComponent.test.tsx` | Ported | `tests/OverlayScrollbarsComponent.test.ts` |
| `test/body/OverlayScrollbarsComponent.test.tsx` | Out of scope: document.documentElement / `document.body.remove()` host takeover | Recorded as a gap; `element="body"` still initializes via the same hook |

## Intentional divergences

- `OverlayScrollbarsComponent` is a function component. There is no `forwardRef`; pass `ref` as a prop.
- Host `element` is a string tag rendered with `createElement`. Generic React `ElementType` component tags are not supported.
- Public node types use `OctaneNode` and do not import React.
