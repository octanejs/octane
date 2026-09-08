# Scoped signal graph experiment

This suite compares the experimental `octane/signals` engine with the exact
Alien Signals 3.2.0 dependency selected by `packages/octane`. It never resolves
the old binding's 1.0.4 catalog entry as the raw comparator. Both APIs are
bundled with identical production options and execute the same graph builder
and operations. The result records the resolved version, revision, lockfile and
fixture hashes, bundle inputs, machine, and Node version.

The comparison measures the cost of the scoped engine against Alien's public
signal/computed/effect API. The raw adapter keeps an explicit list of effect
stops for its imperative owner; it does not implement Octane's retirement,
requests, history, or rendering. This is not a comparison of all those features,
nor a comparison against the old `@octanejs/alien-signals` binding.

## Running

```bash
node benchmarks/scoped-signals/run.mjs --quick
node benchmarks/scoped-signals/run.mjs
node benchmarks/scoped-signals/run.mjs 9 --sizes=100,1000,10000 --cycles=1000
node --test benchmarks/scoped-signals/workloads.test.mjs
```

The unified runner's `scoped-signals` entry uses the same defaults. Quick runs
have three samples, 100/1,000-wide graphs, and 100 consecutive disposal cycles;
normal runs have nine samples, 100/1,000/10,000-wide graphs, and 1,000 cycles.
`--sizes`, `--cycles`, `--rounds`, and `--unrelated` allow explicit experiments,
such as `--sizes=100000` or `--cycles=10000`. These are requested workloads, not
established supported limits. Do not compare unlike configurations.

Set `BENCH_JSON` to save the machine-readable result. Correctness failures
produce a `failed` field and a nonzero exit code. A missing dependency or wrong
Alien version fails rather than substituting another implementation.

An explicit isolated installation is supported when the complete workspace
cannot be installed:

```bash
node benchmarks/scoped-signals/run.mjs --quick --tooling-root=/absolute/path/to/tooling-package
```

That directory must resolve `esbuild` and the exact `alien-signals@3.2.0` package
from its `node_modules`. Both measured APIs use that same Alien installation;
the scoped API still comes from the real `octane/signals` package export.
No renderer or compiler is loaded. Results distinguish this mode from a normal
workspace installation and record the actual dependency paths, versions, entry
and manifest hashes, runner hash, and hashes of every bundled input. This is a
dependency-resolution override, not a substitute engine or an installation step.

### Bounded trace retention

The renderer-free trace workload measures the production scope's trace-event retention
with tracing disabled, before a maximum-size trace fills, and after small and
maximum-size traces wrap. Setup, inspection, and exact retained-sequence checks stay
outside timed intervals so unrelated signal graph work does not hide retention cost.

```bash
node benchmarks/scoped-signals/run-trace.mjs 8
node benchmarks/bench.mjs --quick scoped-signals-trace
node benchmarks/bench.mjs --quick --ratios scoped-signals-trace
```

The timing is normalized to nanoseconds per retained event. Same-run ratios compare the
wrapped maximum budget with the unfilled maximum-budget control; they do not claim
renderer or application-wide gains.

## Graphs and timing

- Independent: one source and one derived output per row; a sparse write has
  constant affected work as the rest of the graph grows.
- Fan-out: one source and many observed derived outputs.
- Chain: one source and a deep series of derived values, with the final value
  observed. Each node is initialized as it is added, avoiding a recursive cold
  read as an accidental construction benchmark.
- Diamonds: one source reaches each observed sum through two derived paths.
- Dynamic dependencies: a selector switches every output between two sources;
  writing the inactive source must not change the observed values.

The size parameter is the number of rows or links, not a claim that every shape
has equal node counts. Results record source/derived node and output counts.
All values are finite integers, where Alien's `!==` equality and the scoped
engine's `Object.is` contract agree.

Construction includes initialization and observer installation. Other rows
measure cached reads, sparse writes, batches, equal-value writes, and dependency switching.
Every operation is followed by public value and notification checks outside
its timed interval. Notification callbacks also reject an incoherent value or
delivery before a batch ends. Checking only a final read could let missing
subscription work appear faster. Exact notification counts are diagnostic,
not a required implementation strategy.

Two warmup samples precede measurements; candidate order reverses on each
sample. The suite uses the repository's shared statistics and reports no new
hard timing threshold before repeatable measurements exist. Detailed semantic
checks can warm caches between operations, so the measurements describe this
observed steady workload rather than unobserved cold computations.

## Continuous ownership and memory

Each continuous run keeps one shared producer alive. Every cycle creates two
owners with 32 derived consumers each, writes the shared source, disposes one
owner, writes again, disposes the second, and writes again. Surviving consumers
must remain current, disposed consumers must stop receiving notifications,
and the shared producer must remain writable. Unrelated owned graphs stay
alive throughout, exposing work that scans the entire application.
Cycle timings include only consumer creation, source writes, and first
disposal. They exclude unrelated-owner setup, verification, repeated
idempotence probes, and checkpoint work.

Unlike the existing browser lifecycle suite, these cycles do not create a new
realm between checkpoints. Timing and garbage collection run separately:

```bash
BENCH_JSON=/private/tmp/scoped-signals-heap.json node --expose-gc benchmarks/scoped-signals/run.mjs --heap --cycles=1000
node --expose-gc benchmarks/scoped-signals/run.mjs --heap --cycles=10000 --snapshots=/private/tmp/scoped-signals-heaps
```

Heap mode records post-GC process memory at cycle 0, 100, and the final cycle,
then again after the shared and unrelated owners retire. Disposed consumer
handles leave the workload's stack before each checkpoint.
Optional V8 heap snapshots support retainer-path investigation. It does not
publish timing scores or treat one heap delta/finalizer deadline as a leak
proof. Heap snapshots can contain process values; store them locally and
review them before sharing.

This focused suite covers synchronous engine ownership. It does not establish
DOM/block cleanup, async-attempt or historical-frame retention, browser memory,
layout/paint performance, or DevTools retention. Those require the native
browser and async-specific experiments described in the implementation plan.

## Public-entry bundle comparison

`run-bundles.mjs` compares `createRoot` exported from `octane` and
`renderToString` exported from `octane/server` with an archived baseline. It
also measures the current `createScope`/`query` engine export and the optional
`useSignal$` client/server exports independently. These are source-entry export
costs, not compiled `.tsrx` applications or incremental hook costs in an app.

Prepare an archive containing `packages/octane/src`,
`packages/octane/package.json`, and the root `package.json`,
`pnpm-workspace.yaml`, and `pnpm-lock.yaml` from the exact baseline revision.
Preserving the package topology also keeps compiler-based checks from treating
an isolated monorepo package as a consumer application. Pass its extracted
package directory and the same revision:

```bash
BENCH_JSON=/private/tmp/scoped-signals-bundles.json node benchmarks/scoped-signals/run-bundles.mjs \
  --baseline-ref=<git-commit> \
  --baseline-package=/absolute/path/to/baseline/packages/octane
node --test benchmarks/scoped-signals/bundle-boundaries.test.mjs
```

The same optional `--tooling-root` mode can supply `esbuild`, Alien Signals
3.2.0, and `devalue` from an existing isolated installation. It does not install
anything. The runner verifies that every bundled dependency uses the selected
installation. Baseline and candidate builds use identical options for each
entry, with ambient TypeScript configuration disabled. Results record raw,
gzip-9, and Brotli-11 bytes; exact loaded-source and bundle hashes; each input's
retained bytes; and the command, toolchain, package manifests, and lockfile
hashes. Baseline source bytes must match their Git blobs. If the archive root
also contains `source.tar`, its hash is recorded.

Boundary assertions inspect the complete resolved graph, including inputs
removed by tree shaking: ordinary entries must not import Alien or the scoped
engine; the independent engine must not import a renderer, compiler, React,
or DevTools; native hook entries must include the correct runtime and Alien
3.2.0. Ordinary runtime exports can resolve their optional native adapters, but
the emitted-byte check requires all client/server adapter, collector, inspection,
and retry implementations to tree-shake to zero bytes. The read/event protocol
and empty server seed map remain separate, measured seams. All exported
functions must load, the empty server render must agree,
and a small engine write/subscription/disposal smoke must pass. These checks do
not establish DOM or native rendering behavior. The runner reuses exact input
bytes across builds and fails if those files change during the run.

Reports remain marked preliminary while integration continues. Preserve each
report and rerun into a new filename after source changes instead of replacing
the earlier measurement. The first recorded comparison is in
`results/2026-08-27/bundles-preliminary.json` with its interpretation in the
adjacent `bundles-preliminary.md`.

## Retained asynchronous producers

The separate async retention diagnostic keeps unresolved producer promises
externally reachable while disposing 1,000 promise owners and 1,000 stream
owners in one Node process. Each stream has an unresolved `next()` and an
unresolved `return()` result. Aborts and returns are observed, but the producers
deliberately do not settle. All owner creation, reads, subscriptions, and
disposal use the public signal API.

```bash
BENCH_JSON=/private/tmp/scoped-signals-async-retention.json node benchmarks/scoped-signals/run-async-retention.mjs \
  --tooling-root=/absolute/path/to/tooling-package \
  --snapshots=/private/tmp/new-scoped-signals-retention-directory \
  --cycles=1000
node --test benchmarks/scoped-signals/inspect-async-retainers.test.mjs
```

The snapshots directory must be new and outside the repository; omitting it
creates a fresh local temporary directory. The runner starts a separate worker
with `--expose-gc`, so the measured process does not retain the bundler or the
offline heap scanner. It snapshots after event-loop turns and three explicit
collections at cycle 0, 100, and 1,000. One live scope with two requests is a
positive control. Later checkpoints retire and drop that scope while all
producer promises remain reachable, then release the external promise array.

The scanner records strong paths, excluding weak edges, and verifies that it
can identify the positive-control scope, four signal nodes, two requests, two
active attempts, and every marked external promise. Counts of revoked attempt
records deliberately exclude V8 object-allocation templates by requiring a
real `settled` Promise and resolver closure. Their separate template count
remains in the report. Primitive heap size changes are diagnostic only: the
externally retained promises and revoked attempt shells are expected to grow.
Disposed owner, signal, request, and iterator counts are the relevant checks.

The first run exposed an iterator retained by a stream close rejection
handler; the fixed rerun and unchanged workload hashes are documented in
`results/2026-08-27/async-retention.md`. Raw heaps remain local. The committed
reports contain metadata and retainer paths only. This workload creates no
historical frames and does not establish native DOM, browser, or DevTools
retention. The separate `native-dom-smoke.mjs` lane is supplemental source ABI
evidence, not compiled `.tsrx`, browser, CI, or heap evidence.

## Native collection and compiled rendering costs

`run-native-costs.mjs` compiles one public `.tsrx` fixture with the archived and
current compiler. It measures production synchronous mount, prop update, signal
update, unmount, and server-render work. The two unread controls compile with
native reads both disabled and enabled, without importing the signal engine.
Read cases cover one source, 16 reads of one source, and 16 distinct sources.
Both `@{}` output and ordinary return-JSX output are included. Each case has its
own bundled runtime so enabling collection cannot affect a disabled control.

```bash
BENCH_JSON=/private/tmp/scoped-native-costs.json node benchmarks/scoped-signals/run-native-costs.mjs \
  --tooling-root=/absolute/path/to/compiler-tooling-package \
  --baseline-root=/absolute/path/to/extracted-baseline \
  --baseline-ref=<git-commit>
```

The baseline must preserve that root/workspace/package topology and contain
`packages/octane/src` from the stated revision. As in the graph runner, every consumed
baseline source is checked against its Git blob. `run.mjs` accepts the analogous
`--source-root` and `--source-ref` options for measuring an archived engine.
Neither runner installs or reconstructs a workspace dependency. A separately
authorized source compiler may require a Node preload; record that command and
provenance explicitly rather than treating it as a locked package or CI result.

The default native run uses two warmups, nine samples, 64 mounts, 2,000 updates,
1,000 server renders, and 100,000 collector cycles. Case order reverses on
alternate samples. Output, host identity, continued producer writes after
unmount, and observer restoration are checked outside measured intervals. The
direct collector cases are empty collection, repeated reads, distinct reads,
four nested witnesses, and replay. They supplement the compiled renderer cases;
they do not establish browser layout, paint, frame, or hydration cost.

Before those measurements, `native-collector-controls.mjs` verifies restoration
of an enclosing observer and writable region. It uses separate untimed bundles,
so these controls do not change the measured collector's exports or loop.

A hook-bearing `use(make$(a, b, c, d, e))` control separately records one factory
call on mount, zero calls for 32 cache hits, and one call for each of 32 misses.
These source-factory counts are deterministic work, not V8 allocation counts.
They have ratio guards in the benchmark registry. Overlapping timing intervals
remain inconclusive; this runner adds no wall-clock pass threshold.

## Focused compiled prop updates

`run-native-props.mjs` isolates the `@{}` prop-update cases when the mixed
mount/update/server workload is too noisy. It uses the same authored fixture,
production compiler options, public renderer controls, and bundle export sets.
There are five cases: unread with collection disabled or enabled, one read,
16 repeated reads, and 16 distinct reads. Ordinary return-JSX cases are excluded.

```bash
BENCH_JSON=/private/tmp/scoped-native-props-01.json node benchmarks/scoped-signals/run-native-props.mjs \
  --tooling-root=/absolute/path/to/compiler-tooling-package \
  --baseline-root=/absolute/path/to/extracted-baseline \
  --baseline-ref=<git-commit> --samples=25 --updates=10000
```

The defaults are 25 paired rounds and 10,000 updates per block. Each version
keeps one mounted root and preallocated props, warms for eight complete update
blocks, then runs twice per pair in seeded ABBA or BAAB order. Case order is
shuffled with the same recorded seed. Public output, host identity, and native
updates are checked outside each timed block. Mounting, signal-update timing,
and SSR remain in the full runner.

Every wall sample is retained. Results include absolute means and uncertainty,
the full paired-ratio distribution, and the geometric mean with a Student-t
95% interval on log ratios. CPU counters and GC overlaps are separate
diagnostics; they neither replace wall timing nor justify dropping samples.
Wide intervals remain inconclusive. Repeat with a fresh output filename in a
new process; the focused runner refuses to overwrite evidence.

Use `--current-root` with `--current-ref` to compare two immutable archives.
Every consumed archived source must match Git, and rebuilt `cd9ed337` and
`422c2c93` renderer bundles must also match their retained consolidation hashes.
The [performance follow-up](results/2026-08-27/parity-performance.md) records
the original temporary harness separately from this reproducible runner,
including helper/loop equivalence, exact bundle hashes, and all noisy or rejected
runs. It does not establish a wall-time speedup or zero overhead.

The [CI repair follow-up](results/2026-08-28/ci-repair.md) records the subsequent
runtime corrections and final-source verification separately.

## Retained foreign success after a branch change

`run-foreign-retention.mjs` keeps one producer scope alive while 1,000 consumer
scopes first read its value, switch to a failing branch that no longer reads the
producer, retain the last success, and then dispose. A live failed consumer is
the positive control. The worker snapshots at cycle 0, 100, and 1,000, then
after retiring the control and finally the producer. It uses the public signal
API and no renderer, async attempt, historical frame, or DevTools integration.

```bash
BENCH_JSON=/private/tmp/scoped-foreign-retention.json node benchmarks/scoped-signals/run-foreign-retention.mjs \
  --tooling-root=/absolute/path/to/tooling-package --cycles=1000
BENCH_JSON=/private/tmp/scoped-foreign-retention-fault.json node benchmarks/scoped-signals/run-foreign-retention.mjs \
  --tooling-root=/absolute/path/to/tooling-package --cycles=1000 --fault-leave-backlinks
```

The deliberate fault leaves the unique foreign-owner backlink in place when a
consumer retires. Only the isolated bundle input is changed; repository source
must remain byte-identical. The fault run must detect growing retained consumer
owners and nodes, then their release when the producer retires. A normal run
must detect zero retired consumers at every checkpoint. All snapshots remain
outside the repository, including when `--snapshots` specifies their directory.

The offline scanner excludes weak edges. V8 also emits conditional WeakMap
edges: a value is counted as reachable only after both the key and backing table
are reachable. `heap-reachability.mjs` implements that rule, with synthetic
controls in `inspect-async-retainers.test.mjs`. Reports preserve known scope
labels, object counts, paths, snapshot hashes, and the source/toolchain inputs.
Heap-byte deltas are diagnostic only and are not a leak criterion.
