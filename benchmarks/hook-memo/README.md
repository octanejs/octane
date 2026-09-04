# Hook memo allocation work

This Node-only benchmark compares the same production application with
`inlineHookMemo: false` and `inlineHookMemo: true`. It measures the work that
ordinary `useMemo` and `useCallback` calls can perform before a dependency
comparison discovers a cache hit.

```bash
node benchmarks/bench.mjs --ratios hook-memo
node benchmarks/hook-memo/run.mjs
BENCH_JSON=/tmp/hook-memo.json node benchmarks/hook-memo/run.mjs
```

There are no preview servers, browser downloads, or timing thresholds. Both
variants use client production compilation with HMR, development metadata, and
automatic region memoization disabled. The latter ensures an unrelated `tick`
prop reaches every fixture body rather than being absorbed by another cache.
Plain TypeScript hooks go through the real `slotHooks` entry point with the same
explicit on/off setting. A separate manual-slot module uses `manualSlots: true`,
matching bindings whose slots must not be automatically rewritten.

## Scenarios and semantic controls

The fixed fixtures cover declarations, identifier dependencies, direct returns,
nested expressions, returned JSX, destructuring, custom hooks called twice,
explicit third-slot arguments, plain-TypeScript and manual-slot hooks, explicit
`null`, and a conditionally reached hook. Each mounts, renders 32 times with equal
dependencies, renders 32 times with changed dependencies, and unmounts. The
conditional case also deactivates and reactivates with unchanged dependencies.

The real bundled Octane runtime renders into happy-dom. Every render checks its
output, memo value, callback result, and identity. A deliberately omitted `tick`
capture must remain stale on a hit and become current on a miss. `null` must
produce fresh identities on every render. Calling a custom hook twice must not
merge its caches. Teardown must empty the container.

The entire sequence first runs without observation. It then runs in a separate
observed bundle, whose final semantic snapshot must equal the clean run and the
other compiler variant. The observer is applied **after** Octane compilation
and bundler tree-shaking, using the clean bundle's source map for attribution.
Putting allocation probes into authored source would change the program the
compiler analyzes; adding them before bundling could also retain otherwise-dead
code. A runtime-form control checks that both known callback and dependency-array
sites remain visible to the observer.

`callback_name_mismatches` records differences from the runtime-form callback
names separately, so a historical compiler with a name-inference defect can
still provide a before measurement. The current regression guard requires zero
mismatches; clean and observed names must always agree within each variant.

## What the numbers mean

The observed copy counts evaluations of function expressions/arrows, array
literals, `new Array(...)`, and rest-parameter array creation. The observer also
has an opt-in extended mode that counts object literals and every other `new`
expression; `transition-hooks` uses it, while this suite keeps the default so its
historical counts stay comparable. Application and
Octane-runtime counts are kept separately in each phase's JSON metadata. This
exposes both call-site dependency arrays and costs moved into runtime helpers,
including the runtime callback wrapper. The `one-per-render` target is a fixed
reference for exact, noise-free count ceilings; it is not another framework.
The aggregate guards exclude the deliberately ineligible identifier-dependency
case and the always-fresh `null` case. Eligible hits must create no function
expressions or application array literals. The total-array ceiling allows the
existing custom-hook/JSX caller arrays, and the miss-function ceiling allows one
fresh callback per observed pair. Separate guards protect the runtime fallback,
explicit `null`, callback names, and allocation-free ordinary flat-cache misses.
Per-case phase counters remain in the JSON so an aggregate change can be traced
to its source.

These are **source-level creation events, not a V8 heap-allocation census**.
An engine can eliminate some source allocations. Conversely, object literals,
function declarations, object/class methods, dynamically named function literals,
native built-ins such as `slice`, and allocations inside external dependencies
are not counted. Static inferred function names are preserved by the observer
and included in the clean/observed semantic comparison. The application
fixtures author arrays only for dependencies, but the application-array metric
also includes any array literals introduced by compilation. Cache-array
constructors and runtime rest arrays are visible separately in the metadata.

`code_raw`, `code_minified`, and `code_gzip` aggregate the compiled fixture
modules; gzip is the sum of independently compressed minified modules.
`bundle_minified` and `bundle_gzip` include their tree-shaken Octane runtime.
All size numbers come from the **clean** output. Mount counts exclude
`createRoot` itself, and teardown has a separate count row.

The fixture, entry, observer, and runner hashes, Node version, esbuild version,
and installed `@tsrx/core` version accompany each result (also inside each
measured target's metadata, which the unified runner preserves).
`OCTANE_MEMO_ROOT` can select another source checkout, while
`OCTANE_MEMO_EXTERNAL_ROOT` can select the checkout supplying an already-installed
dependency tree. Keep those dependencies, hashes, and runner options identical
for a before/after comparison. A nonstandard parser loader must be disclosed
with the result.

The observer's own copy-on-write and counting control can be run with:

```bash
node --test benchmarks/hook-memo/instrument.test.mjs
```

## Initial expansion measurement

On 2026-08-19, the closure-free compiler expansion was compared with an archived
copy of `62785995151f726dcac5b572d25457dd684e8145`. Both used this exact fixture
and runner, Node 26.4.0, esbuild 0.28.1, and the same cached dependencies. The
locked native parser could not be installed because its registry returned 403,
so both runs redirected the compiler parser to the checked-in JavaScript/browser
parser with `@tsrx/core` 0.1.56. These are reproducible source-count and byte
measurements under that fallback toolchain; the locked native-parser run remains
an additional validation requirement.

The table compares the old default inline compiler with the expanded inline
compiler. Eligible totals cover 11 scenarios, each with 32 hit and 32 miss
renders; the miss sequence requires 14 fresh callback results per iteration.

| Metric                                         |  Before |  After |
| ---------------------------------------------- | ------: | -----: |
| Eligible hit function expressions              |   1,088 |      0 |
| Eligible hit application array literals        |     736 |      0 |
| Eligible hit total array creations             |   1,824 |    352 |
| Eligible miss function expressions             |   1,184 |    448 |
| Eligible miss total array creations            |   1,824 |    992 |
| Ordinary flat-declaration miss arrays          |       0 |      0 |
| Runtime-fallback wrapper functions, hit / miss | 32 / 32 |  0 / 0 |
| Explicit-null hit function expressions         |      32 |     32 |
| Callback-name mismatches                       |       1 |      0 |
| Compiled fixture gzip bytes                    |   2,169 |  2,654 |
| Tree-shaken bundle gzip bytes                  |  44,139 | 44,603 |

The already-optimized ordinary declaration and conditional-declaration hits
remain at zero functions and arrays. The residual 352 hit arrays are caller
plumbing, and generic invalidation paths still create arrays. Mount events also
fell from 48 to 25 functions and from 72 to 48 arrays across eligible scenarios;
teardown stayed at 12 functions and zero arrays. This is not an assertion that
the full render performs no allocations.

The cost is larger generated code: +485 gzip bytes for the fixtures (+22.4%) and
+464 for the bundled application/runtime (+1.05%). Within the candidate's
same-run on/off comparison, gzip is 2,654 / 1,976 for compiler output (1.3431×)
and 44,603 / 44,057 for the bundle (1.0124×). All 12 committed ratio guards
passed; the archived baseline breaches seven of them, confirming the gate
detects the intended regression. The initial variadic flat-cache publisher had
added miss-side rest arrays; the benchmark exposed that transfer, and
fixed-arity publishers restored the existing zero-array ordinary miss path
before this result was recorded.

The paired files recorded identical provenance hashes:

```text
fixture  40fb3be39918587e8bc60982da7039266ac167c654012d258d73400c93696037
entry    274e868c669ce9a8c37b1b12aa2e025cf5a73361b414cbdff3b6c2e09384cd16
observer 35e8695da302de113281c45ff5a0322447626e88660c7597070bd3b4365432d7
runner   3f7a2b38bac1666c8987f6bf01b13906988eb333fc4cdc7a390fefa31a4f9137
```

### Revalidation against the PR base

After rebasing onto upstream `922b2d46e50c3b434762c9a61450e7c4c9c1ecde`, a
fresh paired run against that archived base and the rebased candidate reproduced
every count and byte size above. The fixture, entry, observer, and runner hashes
were unchanged. Both runs used the same fallback toolchain, including
`@tsrx/core` 0.1.56 and esrap 2.3.0. The unified runner again checked all 12
hook-memo guards: the base breached seven, the candidate passed all twelve, and
the observer tests passed 2/2. This confirms the result on the current PR base;
the original table remains the measurement against `627859951`.

The archived package manifest and source-tree hashes were:

```text
base      560882e7122a52cbdfb6aa4340a49f71352c1d5301262c682aa87672e9bac00c
candidate d7b8406219c6e7398ca1370d5754977842c957ec2f2853f5c4e34481a27a1981
```

For end-user latency, run a representative production browser workload such as
`memo-wall` separately. This focused suite deliberately makes no speedup or
garbage-collection claim from a smaller source count. It does not measure SSR,
hydration, universal renderers, or concurrent abort/replay; their semantic
contracts remain the responsibility of the owning runtime/compiler suites.
