# Keyed survivor input journal

A surviving keyed row receives its item and captured environment before its body
runs. Both old values must survive an aborted root render. The previous path
wrote two four-slot property entries when both inputs changed; the new entry
stores the old item and environment together in four slots. Rollback restores
the environment before the item, preserving the previous reverse replay order.
Single-input changes still require one entry. Identical inputs require none.

## Measurement

Run against an extracted baseline runtime and the working tree:

```sh
git show ade5be862:packages/octane/src/runtime.ts > /tmp/root-inputs-baseline.ts
node benchmarks/root-transactions/inputs.mjs /tmp/root-inputs-baseline.ts
node benchmarks/root-transactions/inputs.mjs
```

Node v24.20.0, production compiler/runtime, 256 keyed rows:

| Updated inputs | Baseline flat slots | Candidate flat slots |
| --- | ---: | ---: |
| Item and environment | 2,048 | 1,024 |
| Item only | 1,024 | 1,024 |
| Environment only | 1,024 | 1,024 |
| Neither | 0 | 0 |

The observer counts reached input-journal calls and their four log slots. These
are source work counts, not heap allocation measurements or a timing claim.
`BENCH_JSON` emits `root-transactions` targets named `inputs-<mode>` and
`inputs-<mode>-work`, with the `input_slots` operation. Every work reference is 1,024 slots, representing one entry per row. The
unchanged control uses a maximum ratio of zero against that positive reference.

## Semantic controls

The row uses the public compiler for its markup, state, and native event handler.
A small compiler-ABI `forBlock` adapter supplies independently stable or changed
environment tuple identities; normal compiler output otherwise creates fresh
tuples and cannot isolate the item-only control. All 256 button identities and
rendered labels must survive. The first row's local state increments before the
update, remains present afterward, and its updated event increments it again.
Clean and observed bundles must produce identical output and remove all DOM on
unmount.

The regression tests cover held root updates separately; the measurement does
not infer rollback correctness from a successful update.
