# Client hot-path investigations

This covers the client investigations in [#981](https://github.com/octanejs/octane/issues/981)
with one small work reduction and explicit retained-design decisions. The frozen
baseline is `cece195a967d29d1682b37b7c87b9418a8076e95` (merged SSR PR #1088).

| Issue entry | Decision | Evidence |
| --- | --- | --- |
| `renderBranchSlot` common same-arm path | Keep the shared function; move caller hydration reads into slot initialization | Branch experiment below |
| Remaining descriptor explicit/nested strings and component slot coercion | Retain normalization and observable conversion | [Key investigation](./KEYS.md) |
| Oversized client functions | Retain each current structure; `useState` is already a small entry | [Per-function audit](./functions.md) |

The last row covers `reconcileKeyed`, `forBlock`, `mountItem`, `renderBlockInner`,
`setAttribute`, `coerceAttrValue`, `useState`, and client `mapSlot`.
These are investigation dispositions, not a claim that all client overhead has
been removed or that these designs can never improve.

## Branch contract and change

`ifBlock` and `switchBlock` only consume their local hydration capability when
creating a slot. Read it inside that branch. Existing slots still enter
`renderBranchSlot`, whose independent capability read and final hydration cursor
advance remain necessary, including a retry of the same arm.

The pending-parent replay guard, body/environment journaling, markerless
finalization, WIP ownership, reentrant cleanup guards, and `renderBlock` wrapper
remain in place. No flags, fields, allocations, caches, compiler ABI, or public
API are added. The server runtime is unaffected; client hydration still adopts
server output. The change removes one lookup per existing conditional/switch
slot invocation, including empty branches and branch changes.

### Deterministic work

`branches.mjs` compiles 32 mixed `@if`/`@switch` slots through the public compiler
and drives public roots and state updates. It counts the three branch-owned
`activeHydration` call sites after clean tree shaking. The observed build must
match a separate clean build's output, captures, identities, and effect lifetime.
The clean minified build owns timing; observer timings are never used.

Default: 128 warmups, seven samples of 128 operations (896 measured operations).

| Workload | Baseline lookups | Retained change |
| --- | ---: | ---: |
| Stable active arms | 57,344 | 28,672 |
| Toggle active/empty | 57,344 | 28,672 |
| Stable empty arms | 57,344 | 28,672 |
| Fresh roots | 57,344 | 57,344 |

All 33 registered work guards pass. The frozen baseline fails exactly the three
update-lookup guards; mount and key controls pass. These are executed source-call
counts, not measured heap allocations or a latency guarantee. A JIT may already inline or eliminate some original work.
The clean fixture remains 196,097 minified bytes; gzip changes from 60,227 to
60,236 bytes. The nine-byte compression increase adds no source machinery.

### Challenge the proposed split

The experimental split outlines the changed-arm body, preserving its early
returns, while the shared entry retains the pending-parent guard, same-arm
journaling/render, markerless finalization, and cursor advancement. It also
includes the two caller lookup moves. It adds 124 minified / 30 gzip bytes over
baseline and removes no work beyond the lookup-only candidate.

Production Chromium 149.0.7827.55 on macOS arm64, Node 24.20.0: 4,096 warmups,
30 samples of 4,096 updates per case, all six variant orders equally represented.
Times below are microseconds per update, median [minimum, maximum].

| Case | Baseline | Lookup only | Split + lookup |
| --- | --- | --- | --- |
| Stable | 12.134 [11.890, 13.574] | 12.207 [11.768, 19.189] | 12.183 [11.768, 13.110] |
| Toggle | 16.943 [16.040, 23.706] | 17.212 [16.089, 23.389] | 16.455 [16.040, 24.146] |
| Empty | 0.659 [0.586, 0.806] | 0.659 [0.586, 0.806] | 0.610 [0.537, 0.732] |

[Raw samples and bundle hashes](./browser-results.json) accompany the result.
The distributions overlap; stable/toggle results do not establish an application
speed benefit from splitting. Retain the smaller lookup-only change. The timing
run checks actual DOM, current event captures, stable survivor identity, and
effect cleanup, but does not measure layout, paint, startup, GC, or other engines.
The split is an experiment, not a supported second runtime implementation.

### Reproduce

```sh
node benchmarks/bench.mjs client-hot-paths --quick --ratios
node benchmarks/client-hot-paths/branches.mjs
CLIENT_SOURCE_ROOT=/path/to/baseline node benchmarks/client-hot-paths/branches.mjs
```

For timing, build each clean variant with `BRANCH_BUNDLE_DIRECTORY`. Select a
runtime override with `CLIENT_RUNTIME_FILE`; `CLIENT_SOURCE_ROOT` selects the
remaining source graph and `CLIENT_COMPILER_ROOT` optionally selects the compiler.
The fixture/compiler and source graph must be identical across variants except
for the selected runtime. `branch-candidate.mjs` recreates the rejected split
from the baseline runtime into a temporary file. Pass baseline, lookup-only, and
split clean `branches.mjs` bundle files to:

```sh
BRANCH_BROWSER_SAMPLES=30 BRANCH_BROWSER_CYCLES=4096 BRANCH_BROWSER_WARMUP=4096 \
  node benchmarks/client-hot-paths/branches-browser.mjs BASELINE LOOKUPS SPLIT
```

`BENCH_JSON` writes reports. The suite registers deterministic branch/key work
guards. Browser timing and V8 tier diagnostics remain standalone because their
engine-dependent results are not stable CI thresholds.

## Correctness and review

Added render/hydrate tests exercise a held root after branch siblings write:
committed captures/state/refs/effects survive rollback; accepted updates retain
the nodes; disappearance cleans up; reentry mounts fresh state; hydration adopts
the original buttons without recovery. Removing same-arm environment refresh
made four dev/prod cases fail. Disabling conditional hydration adoption made two
hydration cases fail. Both mutations were restored. Review also added explicit
output cardinality assertions so a missing reentry cannot pass an empty loop.

Related branch and keyed-list tests cover transition swaps, render-phase parent
updates, nested lists, arbitrary key conversions, and hydration. The separate
function audit records its narrower coverage and observed deoptimizations.

Coordination with the owner of [#1069](https://github.com/octanejs/octane/pull/1069)
confirmed that its branch helpers are identical to this baseline and have no
active edits. Preserve signal ownership through `renderBlock`; normalized
reconciliation keys remain distinct from raw signal-instance keys. No files in
that task are changed by this investigation.
