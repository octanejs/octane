# @octanejs/recharts

[Recharts](https://recharts.org) for the [octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/recharts
pnpm add @octanejs/recharts
```

A port of recharts 3.9.2 that reuses the framework-agnostic modules (the
Redux/RTK chart state layer, reselect, d3) and reimplements the React layer on
octane's hooks. Currently **partial**: phases 0–1 of the port plan — the static
`BarChart`/`LineChart` pipeline end-to-end (`isAnimationActive={false}`),
byte-identical to upstream in the differential rig. The phased plan lives in
[`docs/recharts-port-plan.md`](../../docs/recharts-port-plan.md).

```tsx
import { BarChart, Bar, XAxis, YAxis } from '@octanejs/recharts';
```

## TypeScript

The package exports authored TypeScript and `.tsrx` source, including its component
prop types. Check applications with `tsrx-tsc --noEmit` and the
`octane/compiler/volar` compiler configured by the Octane CLI. Plain `tsc` does not
check `.tsrx` implementations.

The package is checked with `strict: true`, `skipLibCheck: false`, and no Node
ambient types. `BarProps`, `PieProps`, and the other component prop exports come
from the implementations, not a separate declaration facade. Events use native
DOM types, and refs use Octane's ref-as-prop contract.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
