# Hook records

`hooks.mjs` captures actual `useState`, `useReducer`, and memo cells from the
production runtime. It intercepts `Map.prototype.set` only while mounting the
probe fixtures, restores the native method before updates and measurement, and
never adds properties to the cells. It checks queued state/reducer output and
current-state getters, then inspects V8 maps and heap snapshots. Sixteen disposable
mounts settle constructor slack tracking before the retained samples are created.

The default mode requires one map for each sampled family. Use `--observe` to
inspect the baseline without requiring its maps to be uniform:

```sh
node benchmarks/runtime-object-shapes/hooks.mjs /tmp/baseline/runtime.mjs --observe --output /tmp/hooks-before.json
node benchmarks/runtime-object-shapes/hooks.mjs /tmp/candidate/runtime.mjs --output /tmp/hooks-after.json
```

The launcher supplies `--allow-natives-syntax --expose-gc` to the child process.
V8-specific inspection is confined to this benchmark; correctness tests observe
DOM output, hook return values, stable getter identity, and memo identity.

## Memory and maps

Measured with Node 26.4.0 / V8 14.6.202.34-node.21. Bytes below are the actual
cell's shallow heap size plus its property backing array, where present. They
exclude retained closures, nested values, scopes, DOM, allocator fragmentation,
and peak GC memory. These are per-cell measurements, not total application heap.

| Sample | Baseline cell | Baseline property array | Baseline total | Eager total | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| Idle state | 40 | 0 | 40 | 88 | +48 |
| Idle reducer | 48 | 0 | 48 | 96 | +48 |
| Getter state | 40 | 40 | 80 | 88 | +8 |
| Getter reducer | 48 | 40 | 88 | 96 | +8 |
| Queued state | 40 | 40 | 80 | 88 | +8 |
| Queued reducer | 48 | 40 | 88 | 96 | +8 |
| Settled-transition state | 40 | 64 | 104 | 88 | −16 |
| Settled-transition reducer | 48 | 64 | 112 | 96 | −16 |
| Ordinary memo | 40 | 0 | 40 | 64 | +24 |
| Warm-recorded memo | 40 | 40 | 80 | 64 | −16 |
| Native memo | 40 | 40 | 80 | 64 | −16 |

All eager cells have zero property-array bytes. Across these samples, state maps
fall from four to one, reducer maps from four to one, and memo maps from three to
one. The memo samples exercise publication with ordinary, warm-recorded, and
native evidence; they do not claim to cover every suspension/adoption lifecycle.
The runtime also gives both adopted memo constructors the same field order.

The idle memory increase is deliberate: the layout trades extra eagerly reserved
fields for stable maps and faster transition handling. It does not reduce every
record's memory footprint.

## Production runtime timing

`hooks-timing.mjs` runs complete public-root operations against supplied production
bundles. It does not intercept maps, inspect shapes, snapshot heaps, or time
synthetic record operations. The component calls actual state, reducer, and memo
hooks and returns `null`, avoiding DOM-node creation while retaining root/scope
bookkeeping. The getter case reads both current-state getters in every render.
Assertions after each sample verify actual render counts and resulting values.

```sh
node benchmarks/runtime-object-shapes/hooks-timing.mjs /tmp/baseline/runtime.mjs /tmp/candidate/runtime.mjs --output /tmp/hooks-timing.json
```

There are nine fresh processes per variant, with variant order rotated each
round. Within each process and getter mode:

- Mount/unmount: 500 warmup operations, 1,500 measured operations.
- Ordinary rerender: 4,000 warmup operations, 10,000 measured operations.
- Settled transition: 500 warmup operations, 1,500 measured operations. Each sets
  state and dispatches reducer work, then flushes its publication.

The selection experiment built variants from the same frozen baseline
`fa11c1055`, with only the five hook-constructor changes and their field types
applied to the eager variant. This isolates the hook layout from concurrent
compiler, scope, host, and array changes in this PR. Both builds used esbuild,
`--bundle --platform=node --format=esm`,
`--define:process.env.NODE_ENV='"production"'`, and
`--define:__OCTANE_PROFILE_ENABLED__=false`.

Results are microseconds per complete operation, **median [minimum, maximum]**
across the nine processes on Node 26.4.0:

| Operation | Baseline | Eager fields | Temporary cold record |
| --- | ---: | ---: | ---: |
| Ordinary mount/unmount | 6.328 [5.501, 7.122] | 5.831 [5.238, 11.612] | 6.284 [5.586, 7.317] |
| Ordinary update | 0.762 [0.663, 0.929] | 0.692 [0.642, 0.800] | 0.698 [0.658, 0.814] |
| Getter mount/unmount | 7.496 [5.164, 18.461] | 6.367 [3.479, 8.705] | 6.267 [3.466, 11.175] |
| Getter update/read | 0.731 [0.588, 2.204] | 0.649 [0.589, 1.173] | 0.712 [0.588, 0.919] |
| Ordinary transition | 31.945 [26.720, 35.672] | 25.401 [24.324, 26.805] | 33.319 [32.321, 38.119] |
| Getter transition | 67.932 [66.352, 78.695] | 55.145 [52.694, 64.574] | 66.712 [64.966, 71.792] |

Mount and ordinary/getter update ranges overlap substantially; these samples do
not establish a throughput improvement for those common paths. The eager
transition medians improve by 20.5% and 18.8%, respectively, with almost disjoint
ordinary-transition ranges and disjoint getter-transition ranges. This is one V8
version and one focused workload, not a cross-browser or application-wide claim.

## Rejected cold-record alternative

A temporary design moved `renderTransition`, `urgentTransition`,
`pendingActionBatch`, and `pendingActionValue` into one lazily allocated record.
State/reducer instances retained eagerly seeded queue/getter fields and used
prototype accessors to preserve existing shared transition callers. It retained
one map per family and passed the same behavioral controls.

The hot state/reducer cells were 64/72 bytes, reducing getter and queued cases by
16 bytes relative to baseline, while still adding 24 bytes to idle cells. Once a
transition used the cold record, each record added another 56 bytes: totals of
120/128 bytes, 16 bytes above baseline and 32 bytes above the eager layout. Its
transition timing did not retain the eager improvement. The alternative was
rejected and is not part of the runtime change. Rewriting every shared transition
consumer for direct record access would also involve linked/deferred cells and
requires separate design and measurement.

## Behavioral regression

`packages/octane/tests/plain-hook-memo.test.ts` exercises both compiler memo
modes through the public root. The added case checks queued functional updates,
reducer ordering, stable current-state getters, dependency-hit memo identity, and
an asynchronous Action that stages `undefined` while committed DOM retains its
previous values.

Local validation passed all 56 cases in the development and production projects.
A deliberate mutation made the state getter ignore its pending Action and read
committed state instead. All four selected combinations failed on the observable
getter result (`3` instead of `undefined`). Restoring that single line returned
the full 56-case suite to green. No shape or serializer-count assertions were
added to correctness tests.

The local command used a temporary config that retained the root config's
`octane` and `octane-prod` projects and setup files, narrowed their include list to
this test, and omitted only the unrelated global React differential precompile
because its dependency is unavailable in this checkout:

```sh
./node_modules/.bin/vitest run --config /private/tmp/981-object-hooks-vitest.config.mjs --silent=passed-only
```
