# Runtime object shapes

Production-runtime probes for the remaining hidden-class and array findings in
[issue #981](https://github.com/octanejs/octane/issues/981). These benchmarks
observe private records; correctness tests assert public hook values, memo
identity, DOM identity, hydration adoption, refs, and cleanup.

- [Hook records and measured tradeoffs](HOOKS.md)
- [Memo, keyed-list, and namespace arrays](ARRAYS.md)
- [Compiler memo regions](../hook-memo/README.md)

## Inputs

Use a frozen baseline and candidate bundle built with identical settings and
dependencies. The recorded baseline is `fa11c10556338420dc686a2e93bf1b5787099b30`.
From each isolated checkout, bundle its authored runtime:

```sh
node --input-type=module - <<'JS'
import { build } from 'esbuild';
await build({
  entryPoints: ['packages/octane/src/runtime.ts'],
  outfile: '/tmp/runtime.mjs', // Use a distinct baseline/candidate destination.
  bundle: true, format: 'esm', platform: 'neutral', target: 'esnext',
  define: { 'process.env.NODE_ENV': '"production"' }, minify: false,
});
JS
```

The probes print runtime hashes. Timing uses untouched production bundles;
structural interception, V8 intrinsics, and heap snapshots never run in a timing
sample. Run timing processes without concurrent builds or tests.

## Host, list, and render-capture records

```sh
node benchmarks/runtime-object-shapes/run.mjs /tmp/baseline/runtime.mjs /tmp/records-before.json --observe
node benchmarks/runtime-object-shapes/run.mjs /tmp/candidate/runtime.mjs /tmp/records-after.json
```

The launcher supplies `--allow-natives-syntax --expose-gc`. The default gate
requires one map per family; `--observe` records the baseline without that gate.
Actual records are sampled after four warmup rounds and twelve rounds execute
ordinary lists, keyed selection, and the guarded native-map entry. Both list
constructor sites are exercised. Root commits are flushed before inspecting ref
publication. The fixture checks keyed input identity and typed values after a
reorder, host identity, fresh callable children, changed props, balanced ref
cleanup, scheduled cleanup, and empty DOM after unmount.

Recorded on Node 26.4.0 / V8 14.6.202.34-node.21:

| Actual record | Baseline maps across modes | Candidate maps | Baseline bytes | Candidate bytes |
| --- | ---: | ---: | ---: | ---: |
| Host, no callable children | 2 | 1 | 88 | 80 |
| Host, callable children | 2 | 1 | 112 | 80 |
| Ordinary list | 3 | 1 | 120 | 136 |
| Selection or native-map list | 3 | 1 | 160 | 136 |
| Root capture, plain / detach / cleanup / both | 4 | 1 | 120 | 112 |

Bytes are actual heap-snapshot shallow size plus the record's property backing
array. They exclude DOM, closures, nested collections, allocator fragmentation,
and peak GC memory. Optional capture arrays and Sets remain lazy. Seeding fields
does not allocate those collections. Offscreen captures use the same constructor
as root captures; the table samples root captures only.

Both builds produce semantic SHA-256
`2a6000b6335ec95631f70f64b72f85e69036f286150e6008bdfdb0392cd26298`.
No application latency or total heap reduction is inferred from these structural
measurements. Ordinary lists and unused hook cells reserve more memory; the hook
report gives the full costs and measured transition benefit.

## Correctness controls

Focused development and production validation covers host children appearing,
updating, disappearing, and remounting; keyed selection and fallback-to-native
hydration; and a suspended foreign renderer with a delayed cleanup scheduler.
Deliberately initializing the host's callable body to `null` fails when the input
should appear. Treating an abandoned capture as committed fails the foreign
renderer retry with a duplicate-owner error. Both mutations fail in both modes,
and the restored four cases pass. The full four-file group passes 270 tests.

Removing only the two list constructors' seeded optional fields from a separate
bundle makes the structural guard fail with three list maps instead of one.
That negative control changes no shared source. Behavioral tests continue to
allow alternative internal layouts that preserve the same observable contract.
