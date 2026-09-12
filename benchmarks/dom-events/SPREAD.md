# Spread host resolution

This benchmark exercises the production runtime boundary used by compiled spread
hosts: `snapshotSpread`, authored source rows, `setHostPropSources`, and the
retained prior complete snapshot. It also exercises `ssrAttrs` on Node. It does
not include component scheduling, compiler source-row construction, layout, or
paint in its timings.

## Design and remaining costs

The resolver retains one four-field record per distinct raw name and updates
repeat writers in place. Once every source has been read, that same record can
become the normalized alias winner. This removes the client's normalization
pair and winner tuple per key, and the server's winner tuple. The ordinary
client path and production SSR path iterate the winner Map directly; competing
aliases retain the sorting array needed to preserve the winning raw prop's
original insertion position. SSR development diagnostics retain their array.

The unchanged-value check precedes event parsing after style, raw HTML, refs,
and form-action handling. Controlled fields retain their live-DOM reassertion.
Stable style objects still reach the style setter: getters can be observable or
throw even when the object identity is unchanged. The existing style diff does
not promise to detect mutations made to a previously supplied style object.

Remaining costs are intentional:

- Source rows preserve authored evaluation staging, raw-HTML presence, form
  control aggregation, and synthesized class merging.
- The spread snapshot keeps `Reflect.ownKeys`, enumerable checks, and reads of
  enumerable symbol getters, discarding only the symbol key. Replacing it with
  a string-only enumeration changes observable evaluation. A symbol getter may
  delete a string property already snapshotted.
- Null-prototype snapshots protect arbitrary prop names such as `__proto__`
  from inherited setters. The raw-name and normalized-name Maps preserve both
  raw insertion positions and last-writer alias precedence.
- Changed handlers still create event metadata. A separate JSX-name cache would
  retain another per-name table alongside native delegation metadata. Stable
  handlers now bypass parsing; no extra persistent cache was introduced.

No engine heap-size or allocation-elimination claim follows from these counts.
They count executed source expressions in selected production functions, with
explicit labels for array/record/Map creation, `Object.create`, `Object.keys`,
and `Reflect.ownKeys`.

## Run

From the repository root, using already installed dependencies and Chromium:

```sh
node benchmarks/dom-events/spread.mjs
node benchmarks/bench.mjs spread-hosts --quick --ratios
node benchmarks/dom-events/spread.mjs --runtime-root /path/to/frozen/packages/octane --measure --output /tmp/spread-baseline-work.json
node benchmarks/dom-events/spread.mjs --timing --runtime-root /path/to/frozen/packages/octane --output /tmp/spread-baseline-time.json
node benchmarks/dom-events/spread.mjs --timing --output /tmp/spread-candidate-time.json
```

`--chromium /path/to/installed/executable` selects an existing browser.
`--output` and `BENCH_JSON` preserve full metadata and observations. The ordinary
run emits the common benchmark `targets` format and checks explicit source-work
budgets. `--measure` observes a baseline that is expected to exceed those
budgets. `--timing` builds untouched production bundles, without probes or
`--jitless`; instrumented runs are never timed. Browser source-work observations
use `--jitless` so the source expressions stay explicit.

The client covers 4, 15, and 50 spread properties, canonical names, aliases,
stable capture/bubble handlers, and changed handlers. Every case checks final
attributes, native handler behavior and removal, host identity, and unmount.
Server cases verify serialization and the final alias winner. Separate retained
regressions cover repeated raw aliases, coercion order, getters/symbols,
SSR/hydration identity, undefined removal, style failures/rollback, custom
listeners, refs, and form controls.

## Recorded source work

Baseline: `58da3448b`, frozen before edits. Node and browser versions, original
production bundle hashes, source sites, and all counters are included in JSON.
For 12 updates with 15 spread props (plus one direct title):

| Path | Baseline | Candidate |
| --- | ---: | ---: |
| Client canonical normalization/winner/order arrays | 396 | 0 |
| Client canonical writer records | 192 | 192 |
| Client canonical Maps | 24 | 24 |
| Client stable two-handler metadata records | 24 | 0 |
| SSR alias winner/order arrays | 240 | 12 |
| SSR alias writer records | 228 | 228 |

The 33 canonical arrays removed per update are separate from the authored rows
and snapshot/enumeration arrays, which remain. The ratio guards bound the
complete observed expression count in each case, not only the removed sites.

## Timing observations

Node 26.4.0 / V8 14.6.202.34-node.21 and Chromium 149.0.7827.55 on macOS arm64. Four rounds ran
in two quiet windows, with baseline/candidate order ABBA in each window. Each
fresh process/browser warmed its cases and retained seven measured batches:
3,000 client updates or 10,000 server serializations per batch. The table lists
candidate/baseline median ratios in round order. Ratios below one favor the
candidate.

These measurements are noisy and do not establish a blanket speedup. The
canonical SSR control has unchanged source-expression counts, yet spans
0.705–1.268×. The initial client 50-prop outlier did not recur in three further
rounds. Source-work guards provide the durable regression signal.

| Surface / case | Round 1 | Round 2 | Round 3 | Round 4 |
| --- | ---: | ---: | ---: | ---: |

| client canonical / 4 | 0.978× | 0.977× | 0.729× | 1.127× |
| client aliases / 4 | 0.963× | 0.980× | 0.675× | 1.111× |
| client stable-events / 4 | 0.946× | 0.911× | 0.827× | 1.039× |
| client changed-events / 4 | 0.965× | 0.897× | 0.782× | 1.025× |
| client canonical / 15 | 0.903× | 0.909× | 0.815× | 0.987× |
| client aliases / 15 | 0.992× | 0.930× | 0.821× | 1.086× |
| client stable-events / 15 | 1.025× | 0.909× | 0.758× | 1.058× |
| client changed-events / 15 | 1.104× | 0.966× | 0.681× | 1.017× |
| client canonical / 50 | 1.255× | 0.958× | 0.678× | 0.916× |
| client aliases / 50 | 1.056× | 0.923× | 0.733× | 0.915× |
| client stable-events / 50 | 1.025× | 0.935× | 0.717× | 0.892× |
| client changed-events / 50 | 1.034× | 0.943× | 0.835× | 0.912× |
| ssr canonical / 4 | 0.727× | 0.914× | 0.705× | 1.073× |
| ssr aliases / 4 | 0.706× | 0.919× | 0.741× | 0.968× |
| ssr canonical / 15 | 0.666× | 1.015× | 0.809× | 0.969× |
| ssr aliases / 15 | 0.631× | 0.947× | 0.837× | 1.087× |
| ssr canonical / 50 | 0.770× | 0.960× | 0.789× | 1.268× |
| ssr aliases / 50 | 0.849× | 0.952× | 0.707× | 1.226× |

All four rounds used identical production bundle bytes for each variant:

| Bundle | Baseline SHA-256 | Candidate SHA-256 |
| --- | --- | --- |
| Client | `360fb9dcb714c0a299ab555e7e37af86da33f0f19427dc12ce2698b0fe3744d0` | `585abab40aee1f2b1b768d88f42b1acc82115450ff7f716dc3aa9c729148bcbc` |
| Server | `8714f197262bebc8a4d6e30e3bc275bf864bb58e56f8004c4593cacb80ef61d6` | `4c5e674040384c6f796184f757b293074810bea047ca527cf6fcb74f56cc9671` |

## Behavioral and guard verification

- Four focused files passed in development and production: 120 tests covering
  final host source aggregation, server input spread cascades, spread refs, and
  the new spread-resolution cases.
- Deliberately choosing alias winners by first insertion instead of last write
  failed the new repeated-alias test for both client and server independently,
  in development and production: the losing alias became visible.
- Deliberately skipping a stable style object failed the new getter-error case
  in both modes: the expected user getter exception was no longer observed.
- Each mutation was restored by its exact snippet. All 12 new development and
  production cases passed after restoration.
- `node benchmarks/bench.mjs spread-hosts --quick --ratios` passed all 18 guards.

The focused command is:

```sh
node node_modules/vitest/vitest.mjs run --config /path/to/core-vitest.config.mjs packages/octane/tests/conformance/spread-resolution.test.ts packages/octane/tests/conformance/client-host-source-aggregation.test.ts packages/octane/tests/conformance/server-input-spread-cascade.test.ts packages/octane/tests/spread-ref.test.ts --silent=passed-only
```

The local config retained the repository's core development/production projects
and omitted unrelated React differential precompilation, whose dependency is
unavailable in this worktree. This does not claim a full repository suite run.
