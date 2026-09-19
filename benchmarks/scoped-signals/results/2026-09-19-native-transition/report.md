# Optional native transition driver: matched bundle audit

This compares the native transition policy extraction with exact upstream main
`330bb0878b42dbc445659c5ea40494067c4ef296`. Ordinary client closures save about
1 kB gzip. Signal engine and signal SSR closures grow; this is a partial renderer
size improvement. The full reported unused-signals regression remains open.

All byte counts measure complete retained closures: production/esnext,
`__OCTANE_PROFILE_ENABLED__=false`, gzip level 9, and Brotli quality 11. Do not
add overlapping lane or independently compressed module sizes. Node is
24.19.0 on macOS arm64; esbuild is 0.28.1, Vite 8.1.5, Alien Signals 3.2.0,
devalue 5.8.2, `@tsrx/core` 0.2.0, and `@tsrx/oxc` 0.13.0. Both revisions use
lockfile SHA-256 `af0457e80aa081883f866fdda8aae261145eac1dd08ca9a592a0b24b3984004b`.

## Ordinary client closures

The first six entries use the existing minimal-import fixtures and Vite IIFE
library build; the final entry uses production esbuild ESM. The fixture source is
frozen at the baseline revision for both variants.

| Entry | Baseline gzip | Candidate gzip | Change |
| --- | ---: | ---: | ---: |
| Static root | 62,583 | 61,598 | -985 |
| State hooks | 65,394 | 64,402 | -992 |
| Context | 68,606 | 67,583 | -1,023 |
| Hydrate root | 81,503 | 80,485 | -1,018 |
| Suspense and transition | 78,571 | 77,594 | -977 |
| Deferred hydration | 93,135 | 92,103 | -1,032 |
| `createRoot` export, esbuild | 61,565 | 60,603 | -962 |

This is a matched-delta audit, not a budget pass. The baseline static root already
exceeds the committed 36,480-byte gzip budget, and the candidate still exceeds
it. No budgets changed. The unused client still retains early values, owner and
read protocols, document ownership, and event seams. The extracted coordinator
is absent from the ordinary client closure.

## Signal and SSR tradeoffs

These esbuild rows use identical production ESM options and selected dependency
versions. Native hook entries are complete isolated exports, not incremental
costs in an application. The used client combines the actual `DirectStyles`
fixture, `createScope`, `createRoot`, a two-signal update through `startTransition`,
and teardown. The used SSR combines that same view with real Octane SSR and its
signal scope. Those combined closures count shared code once.

| Entry, esbuild | Baseline gzip | Candidate gzip | Change |
| --- | ---: | ---: | ---: |
| Ordinary `renderToString` | 17,728 | 17,728 | 0 |
| Standalone signal engine | 12,889 | 14,480 | +1,591 (+12.34%) |
| Native client `useSignal$` | 14,297 | 15,894 | +1,597 |
| Native server `useSignal$` | 14,215 | 15,801 | +1,586 |
| Compiled plain signal state | 19,026 | 20,599 | +1,573 |
| Streamed signal bootstrap | 21,933 | 23,519 | +1,586 |
| Results-only bootstrap | 19,935 | 21,531 | +1,596 |
| Used native client | 78,310 | 78,887 | +577 (+0.74%) |
| Used native SSR | 31,888 | 33,468 | +1,580 (+4.95%) |

Actual Vite ES library builds also retain the coordinator; a setter-only virtual
probe is not a substitute for these consumer closures. Vite and esbuild totals
are independent pipelines and must not be subtracted from one another.

| Entry, Vite | Baseline gzip | Candidate gzip | Change |
| --- | ---: | ---: | ---: |
| Standalone signal engine | 14,457 | 16,270 | +1,813 (+12.54%) |
| Used native SSR | 35,443 | 37,282 | +1,839 (+5.19%) |

The coordinator contributes 5,135 minified input-attributed bytes in esbuild
used closures and 9,667 pre-final-minification rendered bytes in Vite. These are
attribution diagnostics, not compressed deltas. Public export loading,
standalone scope reads/writes/notifications/disposal, and exact SSR values pass
for both variants. Esbuild's complete input graph passes the existing dependency
boundaries: ordinary entries exclude the graph/Alien; the engine excludes the
renderer/compiler/React/DevTools. Vite engine output excludes renderer/server
modules and both Vite entries include all user payload in one chunk with no
dynamic or external user-code imports. Source drift checks pass.

## Reproduction and provenance

Prepare an exact archive with the normal workspace package topology, then use
the already installed current-lock toolchain. The runner does not install
anything. Run from the dedicated worktree with Node 24.19.0 on PATH; output
filenames below should be new.

```sh
AUDIT_BASELINE=/private/tmp/octane-native-transition-330bb087
mkdir -p "$AUDIT_BASELINE"
git archive 330bb0878b42dbc445659c5ea40494067c4ef296 \
  packages/octane benchmarks/scoped-signals benchmarks/bundle-size \
  package.json pnpm-lock.yaml pnpm-workspace.yaml > "$AUDIT_BASELINE/source.tar"
tar -xf "$AUDIT_BASELINE/source.tar" -C "$AUDIT_BASELINE"
ln -s "$PWD/node_modules" "$AUDIT_BASELINE/node_modules"
ln -s "$PWD/packages/octane/node_modules" "$AUDIT_BASELINE/packages/octane/node_modules"
BENCH_JSON=/private/tmp/new-native-transition-exports.json node benchmarks/scoped-signals/run-bundles.mjs \
  --baseline-ref=330bb0878b42dbc445659c5ea40494067c4ef296 \
  --baseline-package="$AUDIT_BASELINE/packages/octane" --tooling-root=packages/octane
node benchmarks/scoped-signals/results/2026-09-19-native-transition/vite-controls.mjs \
  "$AUDIT_BASELINE" . . /private/tmp/new-native-transition-vite.json
node --test benchmarks/scoped-signals/bundle-boundaries.test.mjs
node benchmarks/bundle-size/run-minimal.mjs root-static hooks-state context \
  hydrate-root suspense-transition deferred-hydration
```

The final command retains the existing semantic checks and reports budget peers.
Only the behavior-root lanes currently enforce caps in that harness; an ordinary
lane succeeding does not establish compliance with its committed budget. `run-bundles.mjs`
verifies archived consumed sources against the exact Git blobs. The focused Vite
runner uses the real archived `dom-bindings.tsrx` and actual package exports,
checks engine updates/notifications and rendered SSR pixel values, records full
chunk/module metadata and bundle hashes, and rejects source drift.

Original measurement producer SHA-256 values are
`f4f64d8f6ba0bd57a1df8558e9fb618b758d038b90e9c289afd2ed875c20e3e3`
(minimal fixture producer) and
`b829eb3f4ca01a6e9373e80b6b08579cec29dc872d1b0ed25c6ca8310631a554`
(public esbuild producer). The independent esbuild producers agree on the exact
`createRoot` bundle SHA-256 in both variants. The exact baseline archive SHA-256
is `a7bb338a40a882808d3b38da651b04f26717afc7ccdd16ec988980a1275fc2b3`.

Measured candidate source SHA-256 values:

| Source under `packages/octane/src/` | SHA-256 |
| --- | --- |
| `runtime.ts` | `fec3015d2c49ba71346629f67afa3ced0cc8a3d847ce59edbc6230b60e7e7792` |
| `signals/graph.ts` | `56f5f6c516b5c67e0df77b061cb47e47152cd99333e65bf19bb2f46ef16f7ca2` |
| `signals/transition-state.ts` | `2ad5dea614ca304ccb7016d0e13f1a1a3f31f20581e5ba027541fcf9734c9dcb` |
| `signals/transition-coordinator.ts` | `9713775abcb5b0db9ba66851b83371c8bc7b0d87c8053cad57d95f03446511d3` |

Final-source paired remeasurement preserves the exact prior bundle SHA-256 for
all six ordinary Vite fixtures and both Vite signal controls. All esbuild raw
sizes also remain unchanged, but some whole-bundle hashes change and gzip moves
by up to seven bytes; the tables above use the final measured values. Used client
gzip remains unchanged; used SSR retains its exact prior bundle hash. A second
final esbuild candidate run reproduces all 15 bundle hashes and compressed sizes
exactly. Export, engine, SSR, dependency-boundary and source-drift checks pass.
The complete final baseline/candidate bytes and hashes, prior-hash comparisons,
and final runner hashes are recorded in [bundle-hashes.json](./bundle-hashes.json).

## CPU semantic control

A separate public props-only Action smoke checks 96,000 writes, one notification
after coherent DOM, stable node identity, and retired unmounted bindings.
Three warmup pairs precede 12 alternating measured pairs of 4,000 Actions, using
Node 24.19.0/esbuild 0.28.1/happy-dom 20.11.2. Baseline median is 44.66 ms
(IQR 43.82–45.55); candidate median is 45.04 ms (IQR 44.35–47.58). Paired ratios
span 0.915–1.068, mean 1.016: no clear CPU difference beyond observed variance.
This is synchronous happy-dom evidence, not browser latency or SSR throughput.
The subsequent type-only source correction preserves per-module emitted
JavaScript, so the prior CPU control remains applicable; no new CPU improvement
is claimed from the bundle remeasurement.

Original Vite measurement producer SHA-256: `08f63c2b5ff7f5ad448557cdcf4a897b594a40137657ac9f8ac08d8f3c537e87`.
