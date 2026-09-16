# Signal-transition checkpoint

This measures the transition and declaration-options changes against the existing RFC branch at `3c82977459deff9bfdfdc0be2ffa701e02c4a04d`, not against upstream Octane or a consuming application. It does not establish a final application size budget or a runtime speedup.

## Public-entry size

Measured with Node 24.21.0, esbuild 0.28.1, Alien Signals 3.2.0, and devalue 5.8.2 on macOS arm64. Both revisions use identical production ESM/esnext minification and tree-shaking settings. Values are complete gzip-9 entry closures in bytes; overlapping entries must not be added.

| Entry | Baseline | Candidate | Change |
| --- | ---: | ---: | ---: |
| Ordinary client `createRoot` | 59,538 | 64,598 | +5,060 |
| Ordinary server `renderToString` | 17,669 | 17,669 | 0 |
| Scalar DOM bindings | 3,910 | 4,553 | +643 |
| Structural DOM bindings | 9,324 | 10,159 | +835 |
| Signal engine | 9,543 | 10,085 | +542 |
| Native client signals entry | 10,933 | 11,492 | +559 |
| Native server signals entry | 10,845 | 11,407 | +562 |
| Compiled plain signal module | 15,157 | 16,253 | +1,096 |
| Full streamed-signal bootstrap | 18,546 | 19,141 | +595 |
| Results-only bootstrap | 16,561 | 17,151 | +590 |

The candidate's scalar/control/whole-style combined closure is 9,260 bytes. That combined closure, not the sum of its separately compressed leaves, is the relevant selected-capability cost. Renderer-free entries still resolve no renderer, compiler, React, or DevTools implementation; DOM-binding entries also exclude the graph and Alien Signals.

Review caught a draft timeout path that retained optional Suspense/hydration code from a mount-only client entry. Reusing the existing optional visibility driver removed about 8.2 kB gzip from that draft. The remaining 5.1 kB client increase is real: ordinary form Actions can initiate transitions, so restricting initialization to an explicit `startTransition` import would silently omit supported behavior. The mount-only benchmark now also rejects emitted seed-hydration code.

Reproduce against an exact baseline archive:

```sh
BENCH_JSON=/absolute/new-bundle-report.json node benchmarks/scoped-signals/run-bundles.mjs \
  --baseline-ref=3c82977459deff9bfdfdc0be2ffa701e02c4a04d \
  --baseline-package=/absolute/baseline/packages/octane \
  --tooling-root=/absolute/candidate/packages/octane
node --test benchmarks/scoped-signals/bundle-boundaries.test.mjs
```

The original local report is `octane-transition-bundles-final-20260916.json`. It records exact source/bundle hashes and all retained inputs; its source-drift check passed. The ordinary client candidate bundle SHA-256 is `ea16bb9a5f17f278fa99eb814b2e7bb5c522c4272ee86c47290620ebf023af8e`.

## Cached owner reads

The quiet paired run uses 25 samples of 500,000 reads, five warmup blocks, shuffled cases and alternating ABBA/BAAB ordering on an Apple M5 Max. Public ownership, values, subscription behavior and disposal are checked outside timing. These are Node descriptor-loop measurements, not browser rendering, SSR throughput or interaction latency.

| Read | Baseline ns | Candidate ns | Paired ratio | 95% ratio interval |
| --- | ---: | ---: | ---: | --- |
| Implicit owner | 23.108 | 23.654 | 1.02354 | 1.01839–1.02871 |
| Global, explicit owner context | 22.984 | 23.800 | 1.03438 | 1.02203–1.04688 |
| Instance-local | 47.924 | 48.517 | 1.01272 | 0.99834–1.02732 |
| Alternating owners | 51.642 | 51.401 | 0.99569 | 0.98443–1.00708 |

Implicit/global reads regress by approximately 0.5–0.8 ns (2.4–3.4%) in this final run; instance-local and cross-owner changes are inconclusive. The preceding quiet run (`octane-owner-reads-reviewed-20260916.json`) measured 2.2–2.5% implicit/global overhead and an apparent cross-owner improvement that did not repeat. An earlier concurrent diagnostic showed a larger global-read regression; it was not used as a quiet-machine estimate. No wall-time threshold was raised to accept these runs, and no general speedup is established.

```sh
BENCH_JSON=/absolute/new-owner-report.json node benchmarks/scoped-signals/run-owner-reads.mjs \
  --baseline-ref=3c82977459deff9bfdfdc0be2ffa701e02c4a04d \
  --baseline-root=/absolute/baseline \
  --tooling-root=/absolute/candidate/packages/octane \
  --samples=25 --reads=500000
```

The final local report is `octane-owner-reads-final-20260916.json`, rerun after the reentrant native-control correction with other task test/browser lanes idle. Final application startup, rich streaming, allocation/retention, and native iOS Safari performance remain separate qualification work.
