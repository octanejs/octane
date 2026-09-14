# Universal materialization work

This untimed production-runtime benchmark counts executed source array creation
and Set construction during public object-driver renders. Static plans contain
two hosts per row; unkeyed values contain nested singleton child arrays; keyed
scopes use the ordinary `universalFor` path and a state hook per item. Each case
runs with zero, one, and 128 rows across mount, changed props, an aborted
preparation, reorder, and unmount.

```bash
node benchmarks/universal-materialization/run.mjs

BENCH_JSON=/tmp/universal-materialization.json \
  node benchmarks/universal-materialization/run.mjs 1bc1926e809b6f1958dbc274dc68ad1334f68efc

# Record the baseline without enforcing the new work bounds.
BENCH_SOURCE_REF=1bc1926e809b6f1958dbc274dc68ad1334f68efc \
  node benchmarks/universal-materialization/run.mjs --measure
```

The default guard bounds per-row materializer arrays for static plans and scoped
lists, and requires unkeyed array Set work to stay constant as the list grows.
Removing `--measure` from the baseline command demonstrates that the old work
fails these bounds. The unified benchmark runner also tracks these deterministic
counts in its ratio baselines.

## Controls and measurement boundary

The harness bundles the actual universal public entry with esbuild, then uses
the existing hook-memo AST allocation observer on the emitted program. It counts
array literals, array constructors, rest parameters, and Set constructors.
Materializer arrays are attributed to `materializeNode`, `materializeValue`,
`materializeScoped`, and `materializePlanValue`; runtime arrays and Sets include
the complete bundle. Sets include owner and driver bookkeeping as well as key
validation. Built-in methods' allocations and fixture arrays are not counted.

Clean and observed bundles must preserve output hashes, public host identity,
keyed order, per-item state, unkeyed positional identity, unchanged hosts after
abort, and complete teardown. Ordinary updates must emit no structural host
commands. Paired source runs require equivalent public behavior and unchanged
module-initialization counts. Source, bundle, and lockfile hashes are recorded.

These are deterministic source allocation events, not retained heap bytes,
garbage-collection time, or elapsed-time speedups. Engine escape analysis can
remove temporary objects. No browser, native-device, DOM, SSR, or throughput
claim follows from these counts.

## Recorded comparison

On Node 24.20.0 / V8 13.6.233.17-node.53 on Darwin arm64, compared with
`1bc1926e809b6f1958dbc274dc68ad1334f68efc`, a changed-prop update produces:

| 128-row case | Materializer arrays before / after | Runtime arrays before / after | Runtime Sets before / after |
| --- | ---: | ---: | ---: |
| Static host tree | 771 / 515 | 950 / 693 | 27 / 27 |
| Ordinary keyed scopes | 646 / 392 | 1,590 / 1,335 | 412 / 412 |
| Nested unkeyed arrays | 774 / 774 | 953 / 952 | 156 / 27 |

Static plans append hosts into their caller's child arrays, removing one
singleton array per nested host. Keyed scopes share the immutable structural
and output paths for their list site, removing two arrays for every item after
the first. Dynamic arrays remember their first key, then allocate a Set only when another
keyed child appears. This retains SameValueZero equality for NaN and signed
zero and rejects duplicates before evaluating them even if an earlier child
appends to the array during render. Core-owned reconciliation lists also skip
duplicate-key Sets when they have only one child.
Materializer counts for empty inputs, module initialization, and unmount-array
counts are unchanged. Unkeyed empty arrays additionally avoid one Set. The
companion compact-list guard removes one additional runtime array from updates
and aborted preparations that contain no compact lists.

Persisted owner paths retain their ordered segment arrays and `Object.is`
matching contract; depth-dependent copying at dynamic structural boundaries
remains. General dynamic materialization also keeps its result arrays because
its many conditional, portal, retained, and Suspense branches rely on complete
local results. Downstream duplicate scans remain necessary for keys supplied
through host props and static plans, which bypass dynamic-array validation.
