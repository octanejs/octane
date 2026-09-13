# State entry argument-count audit

Issue #981's low-priority `useState` entry item is retained. Its argument-count
check distinguishes a legacy manual `useState(slot)` invocation from authored
Symbol state values, including aliases, explicit `undefined`, and spread calls.
Compiled direct calls have a separate slot, but those public/manual forms share
the same runtime entry today.

`state-arity.mjs` builds the actual production client runtime twice. The control
is unchanged; an intentionally incomplete experimental variant passes `false`
to the existing cell reader instead of evaluating `arguments.length === 1`.
This estimates the benefit available before adding compiler routing, extra
exports, or another wrapper. It is not an implementation proposal: its legacy
manual-call control fails, while both variants preserve the measured direct
two-argument workload's rendered text, node identity, state update, and cleanup.

Baseline: `68d1ea120`, Node 24.20.0, macOS arm64. Each independent runtime warms
256 renders, then measures 20 batches of 128 renders with 128 state calls per
render. The order is baseline–variant–variant–baseline. These are happy-dom
runtime CPU measurements, not browser application latency.

```sh
node benchmarks/compiler-output/state-arity.mjs /path/to/baseline
node --jitless benchmarks/compiler-output/state-arity.mjs /path/to/baseline
```

Median microseconds per render, in run order:

| Engine mode | Baseline A1 | Stripped B1 | Stripped B2 | Baseline A2 |
| --- | ---: | ---: | ---: | ---: |
| Default JIT | 4.891 | 5.813 | 6.500 | 5.696 |
| Jitless | 25.526 | 25.160 | 23.282 | 21.233 |

The candidate does not establish a benefit: default-JIT runs are slower, and
jitless differences overlap the repeated-baseline variation. Removing the
check saves only 18 minified / 7 gzip bytes in this export fixture; a compatible
split must also retain the manual implementation and add selection machinery.
No allocation or application-speed claim follows from these timings.

**Disposition:** keep the existing entry and manual semantics. A future split
would need an independently measured win that pays for the additional compiler
and runtime ABI surface across client, server, universal, and custom renderer
paths. The benchmark remains reproducible evidence for this decision, not a
performance gate for an unshipped implementation.
