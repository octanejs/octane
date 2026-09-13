# Context lookup and active warm plans

This audit covers the remaining context-provider probes and active warm-plan
bookkeeping from issue #981. The baseline is `6284156ce`. The client change only
removes transient bookkeeping in `runActiveWarmPlans`; provider storage, compiler
output, warm occurrence queues, and SSR are unchanged.

## Active warm plans

The previous activation first selected enclosing registrations into an array,
allocated a wrapper callback, and allocated an initial claim Set that every
invoked plan immediately replaced. The activation now finds the first eligible
registration, freezes the current stack end, and invokes each eligible plan
directly. Each invoked plan still gets its own occurrence-claim Set.

The registration stack is restored at renderer checkpoints. Block parent links
are fixed at construction, so the later eligibility checks use the same ancestry
after a nested render returns. Freezing the end prevents newly registered nested
work from joining the outer invocation. The outermost participating Block still
owns the cache; per-plan exceptions remain isolated; both current-cache globals
are restored in `finally`.

Run from the repository root:

```sh
node benchmarks/recursive-context/hooks-warm-work.mjs 6284156ce --measure
node benchmarks/recursive-context/hooks-warm-work.mjs 6284156ce
BENCH_JSON=/tmp/hooks-warm.json node benchmarks/recursive-context/hooks-warm-work.mjs
```

The guard extracts the actual runtime helper declarations, removes TypeScript
with the normal production define, and runs clean and instrumented variants.
The cache collaborator and workload setup are outside the measured source.
Controls assert invocation results, outermost cache ownership, independent
claims, exception isolation, exclusion of unrelated roots, and restoration after
a nested independent root. These are deterministic source-work counts, **not
retained-heap measurements or timings**.

Measured with Node `v26.4.0`, V8 `14.6.202.34-node.21`:

| Activation | Selected arrays before → after | Wrapper functions before → after | Claim Sets before → after |
| --- | ---: | ---: | ---: |
| No work | 0 → 0 | 0 → 0 | 0 → 0 |
| Local plan | 0 → 0 | 1 → 0 | 2 → 1 |
| Eight ancestor plans and local | 1 → 0 | 1 → 0 | 10 → 9 |
| Two ancestors, first throws, and local | 1 → 0 | 1 → 0 | 4 → 3 |
| Reentrant independent root | 2 → 0 | 2 → 0 | 6 → 4 |

The production helper SHA-256 was
`4b70005af58b59d44b5fff52423117bc9014f1c202aa69c5a1313c9443596f99`
before and
`695a4c93f19379cf9dd57334c5f6ab2862124a2b7f39ddf166dc9fe56439e3da`
after. The runner prints fresh source/helper hashes on every run.

### Costs that remain

- Registration must happen before the first descendant suspension. Gating it on
  a previously observed warm episode would miss the first sibling fetch wave.
- A fresh claim Set for each plan preserves distinct repeated component
  occurrences, including equal dependencies. Sharing it across plans changes
  which occurrence can be adopted.
- Real memo occurrence records prevent later sibling suspension from restarting
  requests already created by an earlier sibling. They cannot simply be delayed
  until the first warm activation.
- Per-episode caches, ancestor lookup on actual pending retries, occurrence
  queues, tombstones, and transition harvests still preserve cross-stratum
  adoption, repeated instances, and held-transition rollback.
- Compiler plans with own creations or captured/reassigned locals still require
  their existing expressions, dependency work, and lexical thunks. The existing
  static child-only plan optimization already handles the proven hoistable
  case. Reusing the full module plan for all in-body plans would replay own
  creations or evaluate different bindings. This change does not claim to
  remove those costs.

## Provider lookup: retained after comparison

```sh
node benchmarks/recursive-context/context-provider-work.mjs 6284156ce
```

This diagnostic extracts the actual provider reader and compares it with a
get-first proposal. It checks exact returned values, including a nearest explicit
`undefined` shadowing a defined outer provider. Its 32-level model counts Map
probes only; it does not time walking ancestors or simulate renderer bridges.

| Lookup | Current probes | Get-first proposal |
| --- | ---: | ---: |
| Defined hit, no unrelated provider Maps | 2 | 1 |
| Defined hit through unrelated providers | 33 | 63 |
| Missing context/default | 63 | 126 |
| Nearest explicit `undefined` | 2 | 2 |
| `null` through unrelated providers | 33 | 63 |
| Cached provider owner | 1 | 1 |
| Cached default | 0 | 0 |

The existing one-entry consumer cache already makes recurring reads one live
provider `get`, or no Map probe for a default. The get-first proposal improves
uncached defined hits but adds a second probe at every missing Map. It was
rejected. An encoded-undefined sentinel would require changing provider storage
and every relevant read across client, server, and renderer integration; these
measurements do not justify that ABI change. Both client and server retain their
presence checks so an explicit `undefined` continues to shadow outer/default
values.

## Behavioral validation

`packages/octane/tests/warm-plan-reentrancy.test.ts` uses compiled components and
public mount/update APIs. A request loader renders an independent root during
warming. Each root settles separately, later inputs produce fresh results, and
the nested root keeps its live nodes and values. Existing parallel-use coverage
also exercises throwing getters, rebound bindings, repeated occurrences,
multi-stratum retries, and server-seeded hydration.

The focused run passed **232 tests across eight dev/prod suites**:

```sh
node node_modules/vitest/vitest.mjs run --config /tmp/octane-hooks-vitest.config.mjs \
  packages/octane/tests/warm-plan-reentrancy.test.ts \
  packages/octane/tests/parallel-use.test.ts \
  packages/octane/tests/ssr-parallel-use.test.ts \
  packages/octane/tests/inline-hook-memo.test.ts --reporter=dot
```

The temporary config preserves the repository's client dev/prod projects while
omitting unrelated React differential precompilation unavailable in this local
environment. This focused command does not claim a full repository test run.
Deliberately skipping registered ancestor plans made the new test fail in both
modes: the `insights` and `insights-chart` requests never started. Restoring the
candidate produced the green result above.
