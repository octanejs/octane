# Descriptor child traversal

`children.mjs` runs the real descriptor renderer in Chromium with 128 and 512
keyed host rows. Each row contains an uncontrolled input and native button.
The cases update unchanged rows, reverse them, rotate them, and replace half the
rows. Each runs with ordinary children and with an imperative node plus a portal
in the same host.

```bash
BENCH_JSON=/tmp/children.json node benchmarks/descriptor-renderer/children.mjs
CHILDREN_LEGACY_MOVE=1 node benchmarks/descriptor-renderer/children.mjs

# Use the same runner/dependencies while selecting a frozen runtime source.
CHILDREN_RUNTIME=/tmp/baseline-runtime.ts \
BENCH_JSON=/tmp/children-baseline.json \
node benchmarks/descriptor-renderer/children.mjs
```

## Contract and implementation

Owned rows must have the requested order and retain compatible host nodes,
typed input values, and native events. Portal content and imperative nodes remain
owned by their original sources. Hydration may adopt unstamped server nodes.
Deletion still uses the existing connected cleanup and rollback machinery.

The ordering loop now carries one live sibling cursor. The foreign-node helper
continues from that cursor, skipping complete portal ranges and unowned nodes.
The cursor advances from the placed survivor **after** movement because the
focus-preserving fallback may rotate its surrounding siblings instead of moving
the focused row itself. No descriptor cache, retained state, or extra collection
was introduced; the existing eager ownership and result arrays remain.

The Chromium checks retain a focused input with a backward selection across every
update. `CHILDREN_LEGACY_MOVE=1` masks `moveBefore` on the owning host, exercising
the sibling-rotation fallback in the same real browser. Both variants passed.
This does not establish IME/composition behavior beyond the existing browser
suites.

## Measurement

The clean bundle establishes output, identity, focus, selection, event, and
teardown controls. A separate parsed JavaScript copy adds counters after bundler
tree shaking. It counts reached live `childNodes` index expressions and cached
sibling-getter calls in the child ownership/ordering functions. Clean and
observed semantic snapshots must match. The observer is never used for bundle
size or timings.

Baseline: `3c1cc55d8`. Same environment: Node 24.20.0, Chromium 149.0.7827.55,
macOS arm64, identical installed dependencies. The isolated candidate copies only
the changed child traversal functions into the frozen baseline source, excluding
concurrent event/form optimizations from the size comparison.

| Case | Baseline sibling reads | Candidate sibling reads | Live indexes, baseline → candidate |
| --- | ---: | ---: | ---: |
| 128 rows, foreign children, unchanged | 8,708 | 901 | 256 → 0 |
| 128 rows, foreign children, reverse | 8,644 | 900 | 256 → 0 |
| 512 rows, foreign children, unchanged | 133,124 | 3,589 | 1,024 → 0 |
| 512 rows, foreign children, reverse | 132,868 | 3,588 | 1,024 → 0 |
| 512 rows, foreign children, replace half | 34,437 | 2,054 | 512 → 0 |

The candidate stays below eight observed sibling reads per starting row in every
case. The larger counts include traversal of each row's input/button children;
the counter does not attribute all reads to the outer list. The live-index
counter covers those nested host lists too. This demonstrates removal of the
repeated foreign-prefix scan and mutation-loop index accesses. It is not a
wall-clock speed claim or a count of Blink's internal native traversal steps.

Clean selected-runtime bundle size changes from 168,638 to 168,590 minified bytes
and 54,150 to 54,118 gzip bytes: **−48 minified / −32 gzip**.

The JSON carries source/runner hashes, Chromium and Node versions, observed source
site counts, and semantic snapshots with each measured target so the unified
runner preserves provenance.

## Correctness and guards

`descriptor-children-cursor.test.ts` adds ordinary and foreign reorders,
insertions/removals, portal preservation, a suspended rollback/retry, and server
adoption preserving a pre-hydration input. All ten dev/prod executions pass.
Intentionally retaining the current survivor as the next cursor instead of
advancing it makes all ten executions fail with wrong output order; restoring
the implementation restores green. The six targeted neighboring suites passed
140 tests before that mutation.

The measured targets are `children-{128|512}-{owned|foreign}-{unchanged|reverse|rotate|replace}`.
Their reference targets are `children-{128|512}-reference`, with each denominator
equal to the starting row count:

- `live_indexes`: maximum ratio `0` for every measured target.
- `sibling_reads`: maximum ratio `8` for every measured target.

The existing torn-portal-range recovery and connected deletion callbacks remain
in use. There is no new claim about scoped-descriptor classification, property
diffing, intrinsic array guards, or their separate correctness questions.
