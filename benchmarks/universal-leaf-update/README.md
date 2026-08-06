# Universal leaf updates

This Node-only benchmark reproduces the universal-renderer update-scope workload
from issue #574. One stateful counter sits beside 0–4,000 stateless component
siblings, and each sample measures the same 100 counter updates through the
public compiler, native universal root, object driver, and event-dispatch APIs.

Every scale point verifies the final counter label and exact host-instance
count. The `siblings-4000` / `siblings-0` ratio is the regression signal: work
owned by the counter must not grow with unrelated component siblings.

The `root-state-*` scenario pair covers the issue #574 follow-up shape where
state lives in the root component itself. Re-rendering the root is inherently
O(children), so its guard is the clean/dirty ratio instead of a flat scale
curve: the clean run (leaf props untouched, subtrees adopted without
re-rendering) must stay well under the dirty twin that rewrites every leaf prop
per press.

```bash
node benchmarks/universal-leaf-update/run.mjs 5
node benchmarks/bench.mjs --quick universal-leaf-update
```
