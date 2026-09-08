# Visx ReactNode → OctaneNode type probes

Upstream Visx types child and render-prop returns as `React.ReactNode`. The
Octane port uses `OctaneNode` (`unknown`) because Octane elements are nominal
and would be rejected by `ReactNode`.

These two files assert the same public-surface call shapes, one against the
published upstream typings compiled with `tsc`, one against `@octanejs/visx`
compiled with `tsrx-tsc`. Mechanical inventory, hashes, and negative controls
live in `packages/visx/audit/type-parity.json` and
`scripts/react-parity/visx-types-lib.mjs`.

Permitted differences between the two files, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import/`PiePropsUnderTest` derivation `@visx/visx` `Shape.Pie` → `@octanejs/visx` `PieProps` | the package under test |
| 2 | pristine `@ts-expect-error` reject polarity → adapted accept polarity for the same call shapes | ReactNode rejects unknown; OctaneNode accepts it |
| 3 | heading text `rejects` ↔ `accepts` | documents the polarity flip from transform 2 |

Every shared assertion group below appears in both files under the same heading
number:

1. Pie `children` render-prop return rejects/accepts an Octane renderable.
2. Pie `centroid` return rejects/accepts an Octane renderable.
