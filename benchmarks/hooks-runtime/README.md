# Hooks runtime audit (#981)

This suite guards the remaining hook work against the frozen `6284156ce`
source. It runs actual production runtime code with visible output, retained
identity, subscription, and teardown controls. Counts from observed bundles
describe source work; a reached rest site does not prove V8 allocated an array,
and observed bundles are not timed. The suite is registered in
the existing benchmark runner, with same-run ratio guards in
`benchmarks/baselines/ratios.json`.

| Path | Disposition | Evidence |
| --- | --- | --- |
| State and reducer getter variants | Read the canonical hook cell once and use it for the returned tuple and getter. No new scope or cell fields. | Two hooks × 64 updates: 256 → 128 hook-Map reads with getters; ordinary two-member tuples stay at 128. Direct and nested custom-hook cases retain values, setters, getters, and DOM identity. `state-access.mjs` measures the hook store Map specifically. |
| External store and deferred value arguments | Use fixed trailing parameters and argument count, preserving explicit `undefined`, symbols, numeric previews, and the compiler's trailing slot. Retain immutable external-store effect dependencies until subscribe changes. | Over 128 stable updates, 256 → 0 reached client rest sites and 128 → 0 dependency-pair creations; changed subscriptions and cleanup remain live. The retained pointer adds eight shallow bytes per mounted store record in the measured V8 build. See [argument and storage evidence](./optional-arguments.md). |
| Effect Event | Keep a fresh client wrapper and versioned publication entry on each render. | The old wrapper must call the latest *committed* body, and a suspended or aborted render cannot publish a new body. The argument runner checks the retained wrapper's result and holds entries and wrappers at 128 each as controls. See [argument and storage evidence](./optional-arguments.md). |
| Custom-hook composed paths | Reuse primitive path prefixes and resolved base slots under bounded module-local cache frames. | At most 16 frames and 32 base slots per frame; changing segments, replacement `Symbol.for`, non-primitive coercion, and greater depths retain key behavior. Across 1,000 depth-three calls with eight hooks, registry calls fall from 8,000 to eight on the first pass and zero when warm; repeated string-building sites also fall to zero. The [source helper audit](../custom-hook-path/README.md) records the path oracle, bounds, and retained costs. |
| Warm plans and context | Remove selected-plan arrays, a wrapper, and one redundant claim Set during actual warm activation. Retain the provider presence probe and one-entry consumer cache. | Reentrant roots, throw isolation, and independent occurrences pass the [warm and context audit](../recursive-context/HOOKS-WARM.md). A get-first provider lookup costs 63 rather than 33 probes through unrelated providers and 126 rather than 63 for a miss at depth 32, so that proposal was rejected. |

## Preserved storage and invocation contracts

`Scope.hooks` remains a lazily allocated canonical `Map<HookSlot, cell>`.
Direct compiler numeric keys come from a module-level counter, so a body
appearing late in a module can have only one hook with a large numeric key.
Indexing a dense array by that key would create sparse storage; rebasing it
requires a compiler/storage ABI change. Production helper paths reserve
disjoint numeric ranges when their slots must compose across modules. Explicit symbols and HMR-stable symbols enter the same
hook store. A dense array indexed by direct numbers alone would require a
separate key and lifetime design for composed paths, symbols, HMR preservation,
and rollback of speculative insertions or replacements. The getter improvement
instead returns the resolved cell from the existing read, retaining the current
key and journal authority.

`withSlot` also retains its rest array and native spread. A custom
`Array.prototype[Symbol.iterator]` getter receives the freshly created rest
array as `this`; fast forwarding that reads the getter on `Array.prototype`
changes observable invocation. The custom-hook path optimization therefore
targets key composition, not the callback's argument protocol. The cache
stores primitive key data and resolved symbols, never scopes, Blocks, or hook
values; deep and unusual coercions use the ordinary path. The
[custom-hook runner](../custom-hook-path/run.mjs) exercises client, server, and
universal path keys, registry replacement before and after helper import,
changed descriptions, namespace separation, and cache bounds.

## Reproduce the source-work gates

From the repository root, use the benchmark runner directly (`pnpm bench`
runs a separate news benchmark):

```sh
node benchmarks/bench.mjs --ratios hooks-runtime
```

To compare the frozen source with this branch using the same local dependencies,
first materialize the pinned source, then run the individual diagnostics:

```sh
mkdir -p /tmp/octane-hooks-frozen
git archive 6284156ce package.json packages/octane packages/vite-plugin-octane | tar -x -C /tmp/octane-hooks-frozen
OCTANE_HOOKS_ROOT=/tmp/octane-hooks-frozen node benchmarks/hooks-runtime/state-access.mjs
node benchmarks/hooks-runtime/state-access.mjs
node benchmarks/hooks-runtime/optional-arguments.mjs /tmp/octane-hooks-frozen
node benchmarks/hooks-runtime/optional-arguments.mjs
node benchmarks/custom-hook-path/run.mjs 6284156ce
node benchmarks/recursive-context/hooks-warm-work.mjs 6284156ce
node benchmarks/recursive-context/context-provider-work.mjs 6284156ce
```

The benchmark runner writes gitignored results under `benchmarks/results`.
Individual runners print hashes and semantic checks; set `BENCH_JSON` to a
temporary file when inspecting their ratio payloads. Keep Node, dependencies,
and source provenance the same across paired measurements.

## Combined production browser measurements

The final source was measured on macOS arm64, Node 26.4.0 and Chromium
149.0.7827.55 using the minified production `hook-store-composition` fixture.
Each sample performs 20 public commits over 128 rows; three warmup samples and
explicit GC precede measured work. Builds and browser processes ran sequentially.
The initial A–B–B–A comparison used eight samples per operation. A second used
forty because store-update timings were unstable. All 13 operations in all
runs preserved visible values, survivor nodes, callback identities, subscription
liveness, and teardown. Semantic checksums match between revisions.

| Production JavaScript | Base `6284156ce` | Candidate | Change |
| --- | ---: | ---: | ---: |
| Raw bytes | 253,788 | 255,455 | +1,667 |
| Gzip-9 bytes | 79,078 | 79,812 | +734 |

Baseline asset SHA-256:
`21264076d0bb261fa2aae77d51079579830a82549f348d25f2c6a62ef8250519`.
Candidate asset SHA-256:
`c6988054d5b0eec2f9857d826414c90359696729ffcf7517ac08b0693f7887a1`.
Candidate runtime SHA-256:
`95247553ec528300fedf21eb67e889f4db9ea57d7200683ca3b6a61c1e7f4cbe`;
shared path helper SHA-256:
`906568624f44a9b90084a0eb5cbbbf794a9f59d1a708d167f97a3c8095d94a69`.

Scores below are milliseconds for the whole 20-commit burst, using the shared
benchmark statistics implementation. The four columns are execution order.

### Initial, 8 samples

| Lane | Operation | A1 | B1 | B2 | A2 |
|---|---|---:|---:|---:|---:|
| callback-direct | parent_rerenders | 0.820 | 0.760 | 0.780 | 0.740 |
| callback-direct | changed_dependencies | 1.420 | 1.360 | 1.240 | 1.500 |
| callback-nested | parent_rerenders | 0.960 | 0.840 | 0.840 | 0.980 |
| callback-nested | changed_dependencies | 1.420 | 1.400 | 1.360 | 1.460 |
| raw-store | parent_rerenders | 0.740 | 0.760 | 0.760 | 0.820 |
| raw-store | unchanged_selection | 0.040 | 0.080 | 0.100 | 0.080 |
| raw-store | changed_selection | 0.920 | 1.580 | 1.240 | 0.960 |
| zustand-traditional | parent_rerenders | 1.080 | 0.980 | 0.940 | 1.020 |
| zustand-traditional | unchanged_selection | 0.080 | 0.120 | 0.080 | 0.040 |
| zustand-traditional | changed_selection | 1.180 | 2.000 | 1.200 | 1.240 |
| mobx | parent_rerenders | 1.200 | 1.220 | 1.220 | 1.220 |
| mobx | unchanged_selection | 0.400 | 0.440 | 0.420 | 0.420 |
| mobx | changed_selection | 1.860 | 1.820 | 2.380 | 1.760 |

### Confirmation, 40 samples

| Lane | Operation | A1 | B1 | B2 | A2 |
|---|---|---:|---:|---:|---:|
| callback-direct | parent_rerenders | 0.706 | 0.669 | 0.681 | 0.694 |
| callback-direct | changed_dependencies | 1.212 | 1.294 | 1.256 | 1.225 |
| callback-nested | parent_rerenders | 0.906 | 0.763 | 0.763 | 0.887 |
| callback-nested | changed_dependencies | 1.462 | 1.344 | 1.356 | 1.450 |
| raw-store | parent_rerenders | 0.956 | 0.825 | 0.706 | 0.669 |
| raw-store | unchanged_selection | 0.088 | 0.037 | 0.094 | 0.056 |
| raw-store | changed_selection | 1.131 | 1.525 | 1.275 | 0.862 |
| zustand-traditional | parent_rerenders | 1.050 | 0.950 | 0.950 | 1.044 |
| zustand-traditional | unchanged_selection | 0.081 | 0.156 | 0.056 | 0.150 |
| zustand-traditional | changed_selection | 1.237 | 1.688 | 1.038 | 1.656 |
| mobx | parent_rerenders | 1.256 | 1.200 | 1.175 | 1.219 |
| mobx | unchanged_selection | 0.456 | 0.475 | 0.394 | 0.675 |
| mobx | changed_selection | 1.888 | 1.738 | 2.006 | 1.706 |

### Timing limits and isolated alternatives

Nested callback parent updates scored about 13–15% lower in both paired runs.
There is no overall application speedup claim: direct and store lanes vary,
and raw-store changed selection was slower in the candidate comparisons
(40-sample scores average 1.400 ms versus 0.997 ms for baseline). Candidate
raw-store score uncertainty was 18–20%, and repeated baseline scores differed
by 27%. The initial eight-sample candidate uncertainty reached 53–61%.

Private copies of the same candidate isolated possible causes, with forty
samples and identical semantic checks. Only the named client source was changed:

| Isolated variant | Raw changed-selection score (ms) | Other evidence |
| --- | ---: | --- |
| Restore rest parsing; keep cached dependency pairs | 0.856, then 1.894 on the same bundle | The higher mode remains with original argument parsing. |
| Restore fresh dependency pairs and original StoreInst shape | 0.863, then 1.144 | MobX changed selection worsened to 3.400, then 2.660 ms; this is no clear remedy. |
| Read optional arguments by index with original reflected arity | 1.956 | Removing default formals did not resolve the store timing gap. |
| Restore the complete original client external-store implementation | 1.794 | The declaration/body is identical to baseline after comments are removed. |
| Frozen baseline immediately after that combined revert | 1.038 | Zustand and MobX changed-selection scores were also high in both runs: 2.475/2.262 and 3.625/3.119 ms. |

These controls do not establish that the added dependency pointer or fixed
argument parsing caused the timing gap; reverting both does not eliminate it.
The source-work savings, bounded retention, and behavior are the supported
results. Store-update latency remains an explicitly inconclusive performance
risk, rather than a claimed gain or a new timing budget. The source-operation
guards do not substitute for a stable-browser latency comparison.

For the recorded setup, materialize the frozen source as above and link its
`node_modules`, `packages/octane/node_modules`, and
`packages/vite-plugin-octane/node_modules` to the corresponding directories in
the measuring worktree. Build both fixture variants first, then alternate
`OCTANE_HOOKS_ROOT=/absolute/path/to/frozen` and the unset variable with separate
`BENCH_JSON` files:

```sh
OCTANE_HOOKS_ROOT=/absolute/path/to/frozen node benchmarks/hook-store-composition/run.mjs 40
node benchmarks/hook-store-composition/run.mjs 40
node benchmarks/hook-store-composition/run.mjs 40 --no-build
OCTANE_HOOKS_ROOT=/absolute/path/to/frozen node benchmarks/hook-store-composition/run.mjs 40 --no-build
```

## Correctness validation

The final focused selection covers hooks, custom/manual calls, conditional
slots, state/reducer getters, external stores, deferred values, Effect Events,
transitions, Activity, warm plans, SSR, universal scheduling, HMR, and production
hydration: **2,919 tests pass across 180 development/production project files**.
The local configuration retained the real core project transforms and aliases,
but omitted unrelated React differential precompilation because the copied local
dependencies lack that helper package. The full monorepo run is left to PR CI.
Core and public typechecks pass, as do 15 MCP catalog tests and all 44 Hooks
source-work ratio guards. Public variadic type declarations have a five-error
negative control when hidden in memory; the actual declarations pass.
