# @octanejs/recharts

[Recharts](https://recharts.org) for the [octane](https://github.com/octanejs/octane) UI framework.

A port of recharts 3.9.2 that reuses the framework-agnostic modules (the
Redux/RTK chart state layer, reselect, d3) and reimplements the React layer on
octane's hooks. Currently **partial**: phases 0–1 of the port plan — the static
`BarChart`/`LineChart` pipeline end-to-end (`isAnimationActive={false}`),
byte-identical to upstream in the differential rig. The phased plan lives in
[`docs/recharts-port-plan.md`](../../docs/recharts-port-plan.md).

```tsx
import { BarChart, Bar, XAxis, YAxis } from '@octanejs/recharts';
```

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
