# Client function size and tiering audit

Issue [#981](https://github.com/octanejs/octane/issues/981) identifies several
client functions as too large. This audit checks the production functions that
remain after the earlier compiler, DOM, keyed-list, and transaction work. Source
line count alone does not establish a runtime cost or justify splitting them.

## Reproduce

Use Node 24 and the repository dependencies:

```sh
node benchmarks/client-hot-paths/functions.mjs
CLIENT_SOURCE_ROOT=/path/to/frozen/source node benchmarks/client-hot-paths/functions.mjs
```

The script builds the selected production runtime with esbuild. A diagnostic
build appends an exported object of references to the eight existing functions;
it does not modify their bodies or call sites. A separate minified build omits
that object and records this fixture's bundle size. The diagnostic build keeps
identifiers readable, so it is not byte-identical to an application bundle.

Two fresh child processes exercise the same fixture:

- Precise coverage counts reached functions over two rounds per list mode.
- An uninstrumented warm process runs 300 rounds per mode and records V8's
  bytecode and optimization/deoptimization trace. Native syntax reads function
  references and status only: it does **not** force optimization. Concurrent
  compilation is disabled to make completed tier transitions observable before
  process exit. This is a diagnostic engine configuration, not a latency run.

The three modes cover general keyed items, compiler-proven single-root items,
and native mapped items. Each exercises stable updates, reverse, rotate,
insertion, removal, empty/refill, and unmount. Controls check final row order,
surviving DOM identity, user-edited uncontrolled input values, both parities of
boolean/enumerated/nullable attributes, state updates, and cleanup. The map
eligibility query also checks custom methods and sparse arrays. This hand-authored
compiler-ABI fixture does not measure compilation or all native/fallback dispatch
transitions.

Coverage is filtered by the exact generated module URL. Bytecode and tier events
are matched to the runtime functions' `SharedFunctionInfo` references, rather than
names alone: happy-dom also contains a function named `setAttribute`. Output
includes source, diagnostic-bundle, clean-bundle, and semantic hashes. Exact tier
bits and bytecode sizes are diagnostic observations, not CI correctness guards.
Pointer values are normalized because V8's debug and tier printers can disagree
about leading zeros. Set `CLIENT_FUNCTION_TRACE_DIRECTORY=/path/to/output` to
retain the raw worker stdout/stderr when inspecting an engine or parser change.

## Recorded baseline

Baseline: `cece195a967d29d1682b37b7c87b9418a8076e95`, Node 24.20.0,
V8 `13.6.233.17-node.53`, macOS arm64.

| Function | Reached calls in coverage control | Bytecode bytes | Tiers completed naturally during the warm run |
| --- | ---: | ---: | --- |
| `reconcileKeyed` | 42 | 3,360 | Maglev |
| `forBlock` | 32 | 1,451 | Maglev |
| `mountItem` | 102 | 1,186 | Maglev |
| `renderBlockInner` | 774 | 1,202 | Maglev, TurboFan |
| `setAttribute` | 1,065 | 971 | Maglev, TurboFan |
| `coerceAttrValue` | 963 | 460 | Maglev, TurboFan |
| `useState` | 48 | 59 | Maglev |
| `mapSlot` | 35 | 927 | Maglev |

These are completed tiers anywhere during the run, not a promise that each
function remains optimized after every operation. The trace also records
`wrong map` deoptimizations in `forBlock`, `reconcileKeyed`, and `mapSlot`, and
an insufficient-type-feedback deoptimization in `reconcileKeyed`. The workload
deliberately changes list modes, membership, and array shapes. No reported
deoptimization reason in this run attributes the event to function size.

The selected export fixture is 173,101 minified bytes / 56,058 gzip bytes. This
is an absolute baseline for this export set, not the cost of the eight functions
or a production application bundle. No function was split for this audit, so
there is no claimed bundle or execution speed improvement.

- Runtime source SHA-256: `8c44a1362401d8d79764543622d8a5a2f0f06470060b605f5d115dddcb97e2fa`
- Diagnostic bundle SHA-256: `791005731f153e45127f489fbbd47720e57410b0e4fa1cc769db71641b3c7ac7`
- Clean bundle SHA-256: `2ab758eac59b2eceb1d3ce9f044563de87635dfe8c0c3fe5b6393e30d5ba58c0`
- Semantic SHA-256: `e94adc7e41ef982efde13d8dcbd5308a41d9d13f39c66fa78effb853c8a63e2f`

The final branch-lookup candidate, runtime source SHA-256
`81295bdbb3b5151d2d694a6ac87f46d5b22c0f72fab3a49b463d0fbac389dd59`,
reproduced these bytecode sizes, completed tiers, coverage counts, and identical
clean-bundle and semantic hashes. These eight functions are retained; the
compiled branch fixture separately measures the branch lookup change.

## Per-function decisions and alternatives

### `reconcileKeyed`: retain the existing phase structure

The current entry has direct empty/fill, clear, prefix, suffix, insert-only, and
remove-only returns before the general partition/LIS path. Initial mount callers
already use `mountItemsLinear` directly. A split after prefix/suffix could defer
compilation of the general middle, but must transfer the current cursors, counts,
key source, body, flags, and journaling state. It removes no reconciliation work
by itself. Replacing LIS with a simpler forward movement rule changes the move
cost model; the existing [reorder matrix](../js-framework/README.md#keyed-reorder-matrix-run-reordermjs)
already verifies final order, survivor identity, displacement cases, and bounded
scratch reuse. The measured function reaches Maglev. Retain it unless a browser
profile or startup measurement establishes a profitable outline boundary.

### `forBlock`: retain one owner of list lifecycle

The entry owns lazy slot creation, hydration adoption, iterable snapshotting,
empty-body lifetime, dependency flags, and dispatch to initial or update work.
Splitting initial slot creation from updates is plausible, but the existing
`state === undefined` branch already makes creation conditional. An unconditionally
called setup helper would add a call to each list update; a conditional helper
would move cold code without removing hot work. The 1,451-byte production
function reaches Maglev. Preserve the single lifecycle path until cold-start or
browser data supports extraction, including empty transitions and hydration.

### `mountItem`: retain fresh/adopted ownership branches

Outlining hydration is the most plausible smaller entry: fresh client mounts do
not use that arm. The existing nullable hydration capability skips it. A helper
would need the item, body, key/index context, list ownership, marker policy, and
adoption inputs, including recursive recovery. The measured fresh general and
single-root paths reach Maglev. No repeated work or failed optimization has been
demonstrated that pays for another helper; hydration parse/startup cost remains
unmeasured by this audit.

### `renderBlockInner`: retain the render/restore envelope

This function saves ambient ownership and effect state, invokes user code, and
restores it across success, suspension, errors, and render-phase retries. A
separate ordinary-render wrapper would have to duplicate this envelope or package
saved locals into another representation. The former multiplies correctness
paths; the latter introduces calls or allocations on each component render.
This production function reaches TurboFan in the measured workload. Skipping
transaction support until a component first suspends is also not a valid simpler
path: the existing [root hold experiment](../root-transactions/contracts.md)
demonstrates that earlier sibling writes must already be reversible. Retain the
envelope; use narrow measured work removal within it when a cost is identified.

### `setAttribute`: retain generic dispatch and compiler specialization

The source includes development diagnostics that disappear in production. The
remaining generic entry handles forms, custom elements, raw HTML, namespaces,
hydration, and transaction publication; compiled known attributes already have
specialized writers. A generic early string-attribute fast path would either
repeat eligibility checks or bypass required special behavior. The measured
generic path reaches TurboFan. Prefer routing additional compiler-proven cases
only if an application workload shows those cases reaching generic dispatch.
The existing [spread audit](../dom-events/SPREAD.md) covers the cost and ordering
of source resolution before this boundary.

### `coerceAttrValue`: retain shared coercion semantics

At 460 bytecode bytes this is already substantially smaller than its commented
source suggests, and it reaches TurboFan. A naive `String(value)` path loses
boolean, enumerated, invalid function/symbol, URL, and numeric-attribute behavior.
Caching coercion by object identity is not equivalent when conversion is
observable or the object changes. The current single coercion supplies both the
hydration comparison and the write. Retain it and the specialized compiler
writers; this audit does not establish a useful further split.

### `useState`: retain the existing small entry

The current entry is 59 bytecode bytes, delegates cell lookup to `readStateHook`,
and naturally reaches Maglev. It is no longer a large function. The separate
[state arity experiment](../compiler-output/state-arity.md) already challenges
its argument-count check: removing it breaks legacy manual slot calls and did
not show a stable timing benefit. Another exported compiler-only entry must pay
for its ABI and selection cost before replacing this design.

### `mapSlot`: retain guarded native dispatch

Its two forms share the compiler ABI: eligibility query and rendered dispatch.
The native path must distinguish ordinary packed arrays from custom methods,
prototype/species changes, accessors, and holes. Splitting those forms may reduce
one function's source length, but adds another entry/routing choice while leaving
the required guards. Removing the guard is not a valid alternative: the custom
and sparse controls reject native dispatch. The 927-byte production function
reaches Maglev. Retain the shared entry; a future guard optimization must measure
repeated stable arrays and changed-feature controls, not assume identity implies
unchanged descriptors or prototype behavior.

## Limits and follow-up threshold

The experiment falsifies the blanket claim that these source-sized functions
cannot enter an optimizing tier on this Node/V8 build. It does not prove they
are inlined, optimally compiled, cheap to parse, or fast in an application.
Diagnostic exports retain private references and readable bundling changes the
optimization context. V8 native flags are implementation details and may need
adjustment in future Node versions.

This audit does not measure real DOM implementation cost, layout/paint, Chromium
application latency, Firefox/SpiderMonkey, Safari/JavaScriptCore, hydration,
concurrent suspension, or memory/GC retention. Existing feature suites retain
those correctness contracts. Any future outlining proposal should identify an
observed hot or startup cost, compare identical production fixtures, and include
the modes it moves. No broad client-function rewrite is justified by this result.
