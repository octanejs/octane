# Issue 981 coverage closeout

This suite closes the remaining benchmark wiring gaps in
[#981](https://github.com/octanejs/octane/issues/981). It measures deterministic
production work and checks observable behavior. It does not measure latency,
layout, paint, garbage collection, or actual V8 heap allocations.

```sh
node benchmarks/bench.mjs --quick --ratios audit-981-coverage
BENCH_JSON=/tmp/naive.json node benchmarks/audit-981-coverage/naive.mjs
BENCH_JSON=/tmp/suspense-list.json node benchmarks/audit-981-coverage/suspense-list.mjs
```

Both scripts build their own fixtures, serve them on an ephemeral loopback port,
launch installed Playwright Chromium, and clean up temporary builds and servers.
They require no separately started dev server. The unified runner merges their
distinct targets; the weekly/manual Bench workflow runs that manifest without a
suite filter.

## Actual naive JSX and TSRX work

`naive.mjs` builds the existing `js-framework/octane-jsx-naive` and
`octane-tsrx-naive` applications with their actual Vite compiler configurations.
It invokes the existing `js-framework/style-work.mjs` driver for mount,
selection, a second selection, and an unrelated label update over 1,000 rows.
There is no replacement fixture or source counter inside the compiled bodies.

The driver now supports `WORK_CLEAN=1`: the same production build and actions
without Chromium precise coverage or CSS interception. Seeded labels make the
complete row HTML comparable across separate realms. Both passes independently
check every label, row identity, complete relevant CSS, selection and native
click handling; clean and observed HTML hashes, row counts and selections must
match. Browser errors fail the driver. Instrumented CSS methods forward to the
original implementation and are restored before semantic checks.

Chromium `--jitless` precise coverage observes named entries in the readable
production asset; there are no source instrumentation changes. Missing named
row/runtime coverage fails before guards run. This is the existing style-work
counter contract, now reachable through the unified CLI and ratio system.

| Operation | JSX `setStyle` | TSRX `setStyle` | JSX `renderBlockInner` | TSRX `renderBlockInner` | Native style writes, both |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mount 1,000 | 1,000 | 0 | 3,002 | 2,001 | 1,000 |
| Select one | 1,000 | 0 | 3,002 | 2,001 | 1 |
| Select another | 1,000 | 0 | 3,002 | 2,001 | 2 |
| Unrelated label update | 1,000 | 0 | 3,002 | 2,001 | 0 |

All operations retain zero style removals. The adapter reports additional
`applyStyleValue`, `applyStyleProperty`, `setStyleProperty`, row-body and named
CSS-property counts from the original driver. The 32 new ratios cover the four
columns of work represented by `setStyle`, `renderBlockInner`, `styleSets`, and
`styleRemoves`; the existing driver retains its complete exact work assertions.
Every reference target represents the positive 1,000 rendered-row denominator.
These guards establish a baseline for this existing workload; this PR claims
no reduction in its measured counts.

## Client Suspense inside a keyed list

`suspense-list.mjs` compiles 64 keyed rows with two distinct memo wrappers and an
independent `@try` boundary inside every row. Native promises settle the odd rows,
then the even rows. The workload then changes an unrelated parent heading,
reverses the list, and unmounts it.

The clean minified bundle and readable observed bundle come from the same
compiled, tree-shaken production graph. Their full HTML and lifecycle snapshots
must match after every phase. Checks include:

- Exactly the appropriate visible resolved and pending rows. A hidden staged
  button does not count as a revealed boundary.
- The resolved value belongs to its own keyed row, including out-of-order waves.
- Every surviving row keeps its DOM node and input draft through settlement,
  equal updates and reorder; settlement also preserves the focused input.
- Native button events read the current resolved value.
- Each resolved effect mounts once, no survivor cleans up during updates, and
  unmount clears the root and cleans up every effect exactly once.

Precise coverage starts after module initialization and the root/data setup.
Each operation's coverage ends before semantic event dispatches and assertions,
so those probes do not inflate the measured work. The compiler may give nested
body functions numeric name suffixes; the collector folds only the two authored
body-name families, within this fixture's single production asset. Every measured
function must be positively reached in at least one phase, preventing a renamed
or absent probe from silently satisfying zero-work ratios.

| Phase | `createBlock` | `renderBlockInner` | `RowImpl` | `AsyncCellImpl` | `forBlock` | `reconcileKeyed` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pending mount | 321 | 321 | 64 | 64 | 1 | 0 |
| Settle odd rows | 0 | 64 | 0 | 32 | 0 | 0 |
| Settle even rows | 0 | 64 | 0 | 32 | 0 | 0 |
| Unrelated heading update | 0 | 1 | 0 | 0 | 0 | 0 |
| Reverse settled rows | 0 | 1 | 0 | 0 | 1 | 1 |
| Unmount | 0 | 0 | 0 | 0 | 0 | 0 |

The 36 ratios bound these entries per positive 64-row reference. Zero
`createBlock` calls means this helper was not reached; it is not an allocation
profile. Counts include required boundary orchestration and preserve the
unchanged/update controls rather than using a speculative reduced-work target.

`CLIENT_SOURCE_ROOT=/absolute/frozen/checkout` selects the runtime source for the
Suspense script while retaining this compiler, fixture, dependencies and options.
The naive adapter uses the actual Vite fixture graph in its checkout; compare it
by running the same adapter and enhanced driver in a separate frozen worktree.

## Existing coverage that was already sufficient

The original memo gap is stale: `memo-wall` already has the `Row` and `Inner`
wrappers, two compiled/descriptor walls and nine ratios. The registered
`memo-wrapper-shapes` suite covers 128 and 1,024 distinct client/server wrappers,
live defaults and static-hoisting controls. Its V8 shape counts are diagnostics;
they are deliberately not ordinary semantic assertions.

The original SSR list gap is also stale: `streaming-ssr` places per-card `@try`
boundaries under a keyed `@for`. The new client workload covers client Blocks,
survivors and lifecycle separately. `descriptor-renderer` already has 163
deterministic guards; the naive application adapter adds a guard for the exact
JSX authoring workload rather than relying on those narrower microbenchmarks.

## Measurement provenance and limits

The baseline is merged #1090, `248af4edc30c80498dec13dad4f6d7508f10f220`.
Measurements use Node 24.20.0, the installed Chromium version recorded in JSON,
macOS arm64, production compiler options and disabled HMR/profiling. The
[measurement artifact](measurements.json) records source/build hashes and the
baseline/final work. Counts were unchanged on the final local run.

The new list is bounded coverage, not every Suspense/Activity/lazy combination
or an assertion about hidden-class count. Existing branch, hydration, root hold,
Activity, async-composition and streaming suites retain their broader contracts.
There are no timing thresholds and no prior thresholds are weakened. A future
change that intentionally changes named work should update its guard with fresh
semantic evidence and a documented reason.
