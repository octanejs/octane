# Universal object-driver teardown

This Node-only benchmark measures root unmount through the public universal
runtime and object driver. Each sample mounts a flat keyed list, then times the
transactional teardown that simulates and applies every remove/destroy command.

Every scale point verifies the mounted host count and type, the exact remove and
destroy command counts, and the empty container/driver state after unmount. The
16,384 / 4,096 ratio is the regression signal: four times as many siblings should
remain close to linear. The former per-child `indexOf` + `splice` path shifted
the shrinking sibling array during both transaction simulation and apply, so it
scaled quadratically.

```bash
node benchmarks/universal-object-teardown/run.mjs 7
node benchmarks/bench.mjs --quick universal-object-teardown
```
