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

Prepare an archive containing `packages/octane/src` and
`packages/octane/package.json` from the exact baseline revision. Pass its
extracted package directory and the same revision:

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
3.2.0. All exported functions must load, the empty server render must agree,
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
