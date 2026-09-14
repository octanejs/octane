# Final client function dispositions for #981

This closes the separate `childSlot` and `componentSlotImpl` entries omitted
from the eight-function audit in #1090. Both retain their current implementation.
The frozen baseline is `248af4edc30c80498dec13dad4f6d7508f10f220`;
this PR does not change client runtime source.

## Reproduce

```sh
CLIENT_FUNCTION_SET=slots node benchmarks/client-hot-paths/functions.mjs
CLIENT_FUNCTION_SET=slots CLIENT_SOURCE_ROOT=/path/to/frozen/source \
  node benchmarks/client-hot-paths/functions.mjs
CLIENT_FUNCTION_SET=slots CLIENT_RUNTIME_FILE=/path/to/candidate/runtime.ts \
  node benchmarks/client-hot-paths/functions.mjs
node benchmarks/bench.mjs client-hot-paths --quick --ratios
```

The default eight-function mode is preserved. Slot mode compiles the authored
[`slots-fixture.tsrx`](slots-fixture.tsrx), selects the complete public/internal
client source graph, and runs the same public-root workload in three builds:
minified clean, diagnostic without coverage, and diagnostic with precise
coverage. Diagnostic exports only expose actual function references. Raw V8
traces can be retained using `CLIENT_FUNCTION_TRACE_DIRECTORY`.

Controls assert current labels/events, component and input identity, typed
input, local state, key/type resets, effect cleanup, primitive/null/host/list/
component/portal transitions, and portal/root unmount. Two observed scenarios
and 300 uninstrumented warm scenarios produce the same semantic digest. A
clean build also matches. Hydration, interrupted root transactions, memo/context
refresh, and browser layout are **not measured by this small diagnostic**;
their existing owning regression suites remain necessary.

## Measured facts

Node 24.20.0, V8 13.6.233.17-node.53, Darwin arm64. No forced optimization;
concurrent compilation disabled for trace attribution. See
[`slots-measurements.json`](slots-measurements.json).

| Function | Executed calls / 2 cases | Bytecode bytes | Registers / frame bytes | Natural completed tier |
| --- | ---: | ---: | ---: | --- |
| `childSlot` | 14 | 8,977 | 75 / 600 | Maglev |
| `componentSlotImpl` | 38 | 3,539 | 63 / 504 | Maglev |

V8 counts the receiver among the 15 / 14 parameters respectively. The clean
fixture graph is 174,222 minified bytes / 56,660 gzip bytes in this toolchain,
identical against frozen baseline and this branch. This is a mixed-feature
fixture bundle, not the minimal compiled application or the size of either
function alone. Tier events are matched by actual function identity, not name
alone. A missing tier event is inconclusive. These observations do not prove
TurboFan eligibility, inlining, superior latency, or lower retained heap.

The registered gate caps reached calls at 7 / 19 per completed scenario, using
the two authored scenarios as a positive denominator. Output controls fail
independently of the counter limits. Native tiers, sizes and timings are not
portable pass/fail thresholds.

The registered script also runs the diagnostic worker. It requires Node/V8's
native-syntax flags and a recognized `--print-bytecode` output format; a missing
bytecode record fails the harness before ratio evaluation. A V8 format change
therefore requires updating the diagnostic parser, even when runtime behavior
and counts are unchanged. A missing optimization-tier event is reported as
inconclusive and does not fail a ratio.

## `childSlot`: retain shape and ownership dispatch

The concrete alternatives considered are a scalar/unchanged-slot bypass before
the shared dispatcher and extraction of mount/hydration setup into another
function. The bypass cannot use slot existence as an output-stability proof:
the same slot changes between text, descriptors, lists, components and portals.
An in-memory mutant returning immediately for an existing slot fails the
consumer control on the null-to-host transition (`''` instead of `'host'`).
It never changes repository runtime source.

The dispatcher also must resolve Context/thenables before classifying their
rendered value; validate void-host and raw-HTML ownership; reconcile exact
hydration ranges; and journal shape changes before retiring committed content.
An extracted initializer would still receive the ownership/marker/list flags
and return its state to the same update dispatcher. It would not eliminate that
work, and no measured end-to-end win supports the extra call boundary. Pure
text and compiled loops already have compiler-selected `textSlot`/`forBlock`
routes, while pure-host descriptors and unchanged list/component regimes have
their own conditions inside this dispatcher. Keep those existing proof-based
paths instead of duplicating the generic lifecycle solely to reduce source
line count.

## `componentSlotImpl`: retain the shared lifecycle core

The concrete alternatives are bypassing an existing component slot, splitting
first mount out of the shared implementation, and duplicating generic/void
implementations. The bypass mutant fails public capture freshness (`first:2`
instead of `next:2`). A stable type or normalized key is not sufficient to skip
new props, state, context, memo invalidation, or held transaction work.

Generic `componentSlot` already handles dynamic host strings and returned
values outside the compiler-proven `componentSlotVoid` entry. Both call this
core with an explicit output-handler capability. Initialization covers normal,
single-root and inherited ranges; the shared tail retains memo bailout,
journaling, `renderBlock` wrappers and hydration-cursor advancement. Extracting
initialization does not make the shared tail independent of hydration: fresh
mismatch anchors require scoped suspension while preserving later server
siblings. Duplicating the core adds two lifecycle implementations and does not
remove an observed workload cost. Retain the shared core without claiming a
speed improvement from the diagnostic.

## Boundaries and future evidence

This is an explicit retained-design disposition, not a claim that a split can
never help. A future split must show a clean browser improvement against this
baseline and retain the hydration, key/type, transaction, context and disposal
contracts. Concurrent async-signals PR #1069 additionally depends on typed
structural identity, owner-aware rendering and rollback-safe signal cleanup;
this PR leaves those client regions untouched.
