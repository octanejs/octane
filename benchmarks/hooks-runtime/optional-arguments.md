# Hook argument and store dependency work

`optional-arguments.mjs` builds the actual Octane client runtime for Node in
production mode. Its plain component calls `useSyncExternalStore`,
`useDeferredValue`, and `useEffectEvent` on 128 stable public-root updates. A
separate observed bundle marks each creation of the `[inst, subscribe]` pair and
each Effect Event publication entry at their source locations. The clean and
observed bundles both check visible output, a retained old event wrapper reading
the latest committed value, a single stable subscription, replacement of that
subscription, a store notification, and teardown. The per-render Effect Event
wrapper identity is a benchmark control, not a correctness test assertion.

```bash
BENCH_JSON=/tmp/hooks-baseline.json node benchmarks/hooks-runtime/optional-arguments.mjs /private/tmp/981-hooks-frozen
BENCH_JSON=/tmp/hooks-candidate.json node benchmarks/hooks-runtime/optional-arguments.mjs
node benchmarks/bench.mjs --ratios hooks-runtime
```

The frozen baseline at `6284156ce` includes its complete `packages/octane`
source. The runner resolves build and DOM dependencies from the calling
worktree; keep those dependencies and Node version identical between runs.
`rest_sites_reached` counts the two source rest-parameter sites reached by each
observed component render, based on the six actual client/server/universal hook
signatures. It **does not** claim V8 materialized a heap array for each call.
`subscribe_deps_arrays` counts creation at the client runtime source in the
observed bundle. The source observer is never present in the clean bundle; no
observed bundle is timed. The fixed budget's one-unit reference lets zero-work
guards use a zero ratio without division by zero.

## Frozen baseline and candidate source work

| Work over 128 stable updates | Base `6284156ce` | Candidate |
| --- | ---: | ---: |
| Reached client rest sites | 256 | 0 |
| Subscribe dependency pairs created | 128 | 0 |
| Effect Event publication entries | 128 | 128 |
| Fresh Effect Event wrappers | 128 | 128 |

Both `useDeferredValue` and `useSyncExternalStore` also remove their rest
signatures in the server and universal implementations (one each per function,
six signatures in all). Their optional argument presence is determined by
argument count, including explicit `undefined`, symbols, numbers, and a
compiler-appended slot. The existing universal direct three-argument server
getter fallback is retained. The fresh client Effect Event wrapper and versioned
publication entry stay in place: they protect invocation behavior and keep
uncommitted callback bodies out of a live event.

Client/server/universal optional-argument behavior passes 10 targeted dev/prod
tests, and the existing external-store, deferred, Effect Event, and universal
suite paths pass 228 tests across 12 dev/prod files. Deliberately disabling the
client preview presence check makes both modes fail on the explicit-undefined
preview. Deliberately suppressing dependency-pair replacement makes both modes
fail because the old store remains subscribed; both mutations were restored and
the targeted checks passed again.

## Choice of dependency-pair storage

Three source variants copied from the same candidate state compared the normal
per-render pair, a pair retained on the StoreInst, and a read of the existing
EffectSlot's dependency pair. All passed clean and observed semantic gates.

| Variant | Pair creations / 128 updates | Native Map.get / 128 updates | StoreInst shallow bytes | Bundle raw / gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| Fresh pair | 128 | 896 | 88 | 347,569 / 109,086 |
| Retained pointer | 0 | 896 | 96 | 347,653 / 109,123 |
| EffectSlot lookup | 0 | 1,024 | 88 | 347,631 / 109,119 |

The Map counter covers the full happy-dom drive and is untimed; the extra 128
lookups in the EffectSlot variant are one per update. A V8 heap snapshot of a
mounted store record on Node 26.4.0 measured the retained pointer's extra eight
shallow bytes. The dependency array it points at is already held by the effect
slot. The retained pointer avoids an added Map lookup on each render, at the
cost of eight bytes per mounted external-store hook and 84 raw/37 gzip bytes in
the isolated Node bundle. A changed subscribe replaces the pair; if a render is
abandoned, the next render compares subscribe again before reuse. Until then,
the record can retain the last attempted pair alongside the committed effect
pair; this is at most one cached pair per store hook, released with its owner.
The existing record already retains the latest enqueued subscribe function. The whole PR
bundle changes other hook paths too, so these isolated bytes are the relevant
attribution for this choice.

Secondary full-root Node/happy-dom timing used six rotating process rounds per
variant, 3,000 warmup updates and 18 samples of 1,000 updates per process. Round
medians in microseconds per update were:

| Variant | Six round medians | Range across individual samples |
| --- | --- | --- |
| Fresh pair | 0.96, 0.98, 1.02, 1.00, 0.96, 0.96 | 0.64–1.72 |
| Retained pointer | 1.01, 0.94, 0.90, 1.04, 0.94, 0.94 | 0.63–1.92 |
| EffectSlot lookup | 1.00, 0.89, 0.97, 0.98, 0.98, 1.13 | 0.59–1.93 |

The ranges overlap. These timings establish no application latency gain; the
source work and memory tradeoff above are the supported result. Raw timing and
memory snapshots were captured in `/private/tmp/981-hooks-timing-report.json`
and `/private/tmp/981-hooks-memory-{fixed,cell,slot}.json` during this audit.
