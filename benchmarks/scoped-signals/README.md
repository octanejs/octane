# Scoped signal graph experiment

## Server component frame recipes

`ssr-component-frames.test.mjs` compiles matched public keyed SSR workloads in
development and production modes. An ordinary module keeps the nine-field frame;
an opaque text/control module starts with its four lazy signal identity fields and
an empty materialized-identity cache slot. The untimed observer counts subsequent recipe-field assignments, component
frames, restore envelopes and cache-slot appends. These are source-work counts, not V8 heap bytes.

Each observed build must match its clean build's HTML exactly. The controls check
text and input values, reordered real-handle control identities after ordinary
renders, deferred raw object-key coercion, nested rendering and static output. The
observer restores an existing global property descriptor. This gate runs through
`ci:workflow:test`; it does not establish a runtime CPU improvement or remove the
per-component restore envelope.

```bash
node --test benchmarks/scoped-signals/ssr-component-frames.test.mjs
```

## Optional server list identity work

The server-list case in `bundle-boundaries.test.mjs` compiles an opaque text and
control consumer through the production SSR compiler. Across two orders of a
100-row object-keyed list, ordinary scalar output must serialize no optional
signal keys. Its actual-handle control must preserve distinct serialized control
identities across both orders and exercise key serialization. Both lanes check
the resulting text and input values.

```bash
node --test --test-name-pattern='ordinary server lists defer' benchmarks/scoped-signals/bundle-boundaries.test.mjs
```

This is a deterministic work guard, not a timing or heap claim. Potential list
arms still allocate a persistent raw-key recipe; actual handles resolve and cache
the original wire keys. The owning hydration regression also checks nested
directive and mapped lists, adopted native controls, native edits and cleanup.

## Compiled native presentation channels

`run-native-presentation.mjs` compiles the authored `native-presentation/View.tsrx`
and its real `adoptBindings` activation, uses authentic SSR output, and compares
coarse immutable snapshots with direct signal/derived-signal channels on the same
view. The fixture deliberately passes unsuffixed aliases for classes, two CSS
custom properties, text, and an unrelated title. StyleX atoms come from its Babel
compiler, and the runtime calls the actual `@octanejs/stylex` `attrs` merge so
competing variants keep their normal precedence. There are no copied class hashes.

```bash
BENCH_JSON=/absolute/path/new-native-presentation.json node benchmarks/scoped-signals/run-native-presentation.mjs --samples=7 --updates=5000
```

If this checkout has no StyleX dependencies, select an existing approved
installation with `--stylex-tooling-root=/absolute/path/to/package`. The runner
does not install or copy dependencies. Both lanes use that same installation and
the real workspace `@octanejs/stylex` source wrapper; the report identifies the
selected runtime and hashes all loaded source inputs.

Every run checks identical native classes/styles/text, preserved host identity,
no equal-SSR adoption rewrite, variant precedence, replaced-source detachment,
and disposal. Deterministic counters distinguish source snapshots, projected
field reads, and StyleX merge calls. Direct progress/title notifications must not
run the whole projection or StyleX selector; changing the variant must run it once.
Two warmups precede samples, and lane order alternates. All timing samples are
retained. These are synchronous happy-dom measurements, not browser layout,
paint, Safari, or application latency evidence; timing has no hard pass threshold.

Byte accounting separates the complete renderer-free activation, the isolated
optional signal connector, and the fixture plus real graph/StyleX. Isolated
connector bytes are not an incremental application delta because dependencies
can be shared. Resolved client graphs must exclude the renderer, and activation
alone must exclude the signal graph/facade. `BENCH_JSON` must be a new absolute
filename; source drift during a run fails instead of publishing mixed evidence.

## Signal-valued DOM styles

`run-dom-bindings.mjs` compiles and bundles three production components through the
public entries. All update two CSS properties and preserve a child node. One
passes signal handles directly; another samples them with `.get()` in setup.
The plain-props lane uses numeric expressions in the same signal-capable module.
Every sample checks the resulting CSS, host and child identity, and teardown.

```bash
node benchmarks/bench.mjs --quick signal-dom-bindings
BENCH_JSON=/private/tmp/signal-dom-bindings.json node benchmarks/scoped-signals/run-dom-bindings.mjs
node benchmarks/scoped-signals/run-dom-bindings.mjs --quick --fault-component-read
```

The ratio guards require zero component-setup calls for direct signal updates;
the sampled control must execute setup for every update. The fault command
deliberately adds component reads and must fail. Plain fixed-property styles must
allocate no native presentation blocks or run native style update bodies. A
separate observed production bundle counts those sites after compilation; the
direct-handle lane must exercise both observers. Its CSS and text must match the
clean bundle, and both retain host/child identity and detach on unmount. Observed
bundles do not contribute to bytes or timing. JSON records source,
compiler-output, bundle and input hashes. Synchronous happy-dom timings are
supplemental: they exclude browser layout/paint and have no hard speed threshold.

## Graph engine comparison

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

The renderer-free trace workload checks disabled tracing without timing it, then
measures the production scope's trace-event retention before a maximum-size trace
fills and after small and maximum-size traces wrap. Setup, inspection, and exact
retained-sequence checks stay outside timed intervals so unrelated signal graph
work does not hide retention cost.

```bash
node benchmarks/scoped-signals/run-trace.mjs 8
node benchmarks/bench.mjs --quick scoped-signals-trace
node benchmarks/bench.mjs --quick --ratios scoped-signals-trace
```

The timing is normalized to nanoseconds per retained event. Same-run ratios compare the
wrapped maximum budget with the unfilled maximum-budget control; they do not claim
renderer or application-wide gains.

## Baseline versus candidate owner reads

`run-owner-reads.mjs` bundles the actual archived and current `octane/signals`
public exports, without source overlays or compiler specialization. Prepare the
same baseline archive topology described under public-entry bundle comparison.
Every consumed baseline source must match its Git blob. Both variants use the
same compiler-owned `__signalAt('g:…', value)` / `__signalAt('i:…', value)` declarations,
production esbuild options, and explicitly pinned dependency versions. This fixed
site entry preserves the same owner-read workload across the authored `{ key }`
API migration; it does not benchmark declaration syntax or compiler cost.

```bash
BENCH_JSON=/private/tmp/owner-reads-prepare-01.json node benchmarks/scoped-signals/run-owner-reads.mjs \
  --baseline-root=/absolute/path/to/extracted-baseline --baseline-ref=<git-commit> --prepare
BENCH_JSON=/private/tmp/owner-reads-measured-01.json node benchmarks/scoped-signals/run-owner-reads.mjs \
  --baseline-root=/absolute/path/to/extracted-baseline --baseline-ref=<git-commit> \
  --samples=15 --reads=200000
```

An existing installation may be selected with `--tooling-root`. The runner never
installs dependencies and requires a new absolute `BENCH_JSON` filename. Prepare
mode compiles and checks semantics without collecting timing. Measurement mode
rebuilds and verifies actual sources; run it in a quiet process after other tests,
builds and browsers finish. Reports retain bundle and exact loaded-source hashes,
manifests, lockfiles, toolchain, authored entry and runner provenance, and reject
source drift during the run.

Cached global, instance-local and cross-owner reads use `runWithSignalOwner`.
The separate implicit-read case uses an installed public owner carrier; it does
not simulate the browser's default document owner. Setup and five warmup blocks
are excluded from timing. Seeded rounds shuffle cases and alternate paired ABBA
and BAAB blocks. Every sample is retained, with arithmetic mean uncertainty and
the paired ratio distribution/geometric 95% interval. Subscription ownership,
unsubscribe, shared globals, isolated locals and retirement are checked outside
timing. This is Node descriptor-loop evidence, not Safari, streaming, hydration
or application latency evidence, and there is no wall-time pass threshold.

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
`useSignal$` client/server exports independently. A plain state-module case
declares `signal$`, `derived$`, and `query$`, transforms it through the public
`octane/compiler/bundler` hook-slot path, and bundles the actual compiler output.
A separate case retains the automatic streamed-signal bootstrap and document
lifecycle exports. Both must remain renderer-free. These are entry/compiled-state
costs, not compiled `.tsrx` applications or incremental hook costs in an app.

Signal engine, native hook, compiled state, stream bootstrap, and scalar/structural
DOM-binding entries are compared when the archived package exports them. Older,
pre-RFC baselines report absent entries as `unavailable` with a reason and no numeric
delta; ordinary client/server comparisons remain mandatory. This measures the
entire retained change from the selected commit, not only the latest edits to an
unpublished prototype. Optional control and whole-style leaves are measured separately and
together with the scalar runner. Use the combined closure for their shared cost:
independently compressed gzip/Brotli byte counts must not be added together.

Prepare an archive containing `packages/octane/src`,
`packages/octane/package.json`, and the root `package.json`,
`pnpm-workspace.yaml`, and `pnpm-lock.yaml` from the exact baseline revision.
Preserving the package topology also keeps compiler-based checks from treating
an isolated monorepo package as a consumer application. Pass its extracted
package directory and the same revision:

```bash
BENCH_JSON=/private/tmp/scoped-signals-bundles.json node benchmarks/scoped-signals/run-bundles.mjs \
  --baseline-ref=<git-commit> \
  --baseline-package=/absolute/path/to/baseline/packages/octane \
  --tooling-root=/absolute/path/to/current/packages/octane
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
The compiled state case additionally records its exact authored/transformed
sources, compiler options, and hashes of the local compiler implementation.

Boundary assertions inspect the complete resolved graph, including inputs
removed by tree shaking: ordinary entries must not import Alien or the scoped
engine; the independent engine must not import a renderer, compiler, React,
or DevTools. The compiled plain-state and automatic stream-bootstrap entries
have the same resolved-graph prohibition, including renderer imports that emit
zero bytes after tree shaking. This prevents an apparently small export-only
measurement from hiding a renderer dependency introduced by compilation or
automatic owner initialization. Native hook entries must include the correct runtime and Alien
3.2.0. Early signal and binding entries also reject a resolved transition-frame
module, even if it emits zero bytes: a split-chunk application's recursive module
group can otherwise hoist the deferred renderer's frame into startup. The report
records this check for both revisions and gates the candidate; a historical
baseline may retain the old edge.
Ordinary runtime exports can resolve their optional native adapters, but
the emitted-byte check requires all client/server adapter, collector, inspection,
and retry implementations, plus server query-observation mirrors, to tree-shake
to zero bytes. The read/event protocol
and empty server seed map remain separate, measured seams. Renderer-free
binding entries also reject the renderer, signal graph/facade, Alien Signals, and
unselected control/style/class/signal/structural leaves in their resolved graph.
All exported functions must load, the empty server render must agree,
and a small engine write/subscription/disposal smoke must pass. The compiled
state case also checks derived updates, async query completion, and fresh values
after retiring an owner. These checks do not establish browser capture, streamed
handoff, or native rendering behavior. The runner reuses exact input
bytes across builds and fails if those files change during the run.

Historical reports retain the status recorded at their measured revision.
Preserve each report and rerun into a new filename after source changes instead
of replacing the earlier measurement. The first recorded comparison is in
`results/2026-08-27/bundles-preliminary.json` with its interpretation in the
adjacent `bundles-preliminary.md`.

The opaque-attribute work guard compiles the same consumer with one or 100
attributes in TSX/TSRX and development/production modes. An observed build counts
attribute helper and policy entries after compilation; its output, evaluation
counts, host identity, input restoration, handle updates, and teardown must agree
with an unobserved build. Repeated strictly equal defined scalar attributes retain
the shared helper call and omit deeper policy/handle probes. Changed values,
undefined, objects, functions, and handles exercise the binding path. NaN also
re-enters conservatively. Bundle bytes use only the unobserved build. This guard
measures deterministic work, not CPU time or browser layout, and its used-signal
fixture does not establish a reduction in generic runtime bundle size.

```bash
node --test --test-name-pattern='repeated opaque primitive attributes' \
  benchmarks/scoped-signals/bundle-boundaries.test.mjs
```

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
BENCH_JSON=/private/tmp/scoped-signals-derived-retention.json node benchmarks/scoped-signals/run-async-retention.mjs \
  --tooling-root=/absolute/path/to/tooling-package --api=derived --cycles=1000
node --test benchmarks/scoped-signals/inspect-async-retainers.test.mjs
```

The snapshots directory must be new and outside the repository; omitting it
creates a fresh local temporary directory. The runner starts a separate worker
with `--expose-gc`, so the measured process does not retain the bundler or the
offline heap scanner. It snapshots after event-loop turns and three explicit
collections at cycle 0, 100, and 1,000. One live scope with two requests is a
positive control. `--api=derived` runs the same producers through public unified
`derived$` declarations and `runWithSignalOwner`, instead of the default
`query`/`createResource` path. Its positive control has the same four nodes
and one iterator but no query request records. Later checkpoints retire and drop that scope while all
producer promises remain reachable, then release the external promise array.

The scanner records strong paths, excluding weak edges, and verifies that it
can identify the positive-control scope, four signal nodes, two requests, two
active attempts for the query path, and every marked external promise. The
derived path requires zero query records and retains the same owner/node/iterator
checks. Counts of revoked attempt
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
update, unmount, and server-render work. The two unread controls use an ordinary module and a module containing native
capabilities, without importing the signal engine into either final bundle.
Current compilers select tracking from the fixture's explicit signals import; archived experimental compilers
receive their original option. Both revisions compile identical source per case.
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


## Immutable primitive setup values

`primitive-local-values.test.mjs` is part of `ci:workflow:test`. It checks matched
client/server, development/production, TSRX/returned-JSX output using frozen
parser ASTs. Immutable lexical values derived from proven primitives omit the
optional value adapters; authored casts, opaque calls and members, mutable
bindings, shadowed intrinsics, and invalidating writes keep their adapters.
Constructor-name member writes and unknown computed member writes also decline
new intrinsic-result local facts, even through aliases. References to mutating
member methods such as `Object.assign`, `Object.defineProperty`, `Reflect.set`,
`__defineGetter__`/`__defineSetter__`, `setPrototypeOf`, and `deleteProperty`
(including optional and TypeScript-wrapped calls) also conservatively decline
these facts. Every unknown computed member reference declines new intrinsic-local
facts, including extracted mutators and unrelated dynamic property reads.
JavaScript operator and template guarantees remain eligible; preexisting child
proofs remain intact.

The public controls keep controlled-input restoration, hidden native reads,
real handles, and keyed identities observable. A real split model module loads
only after two keyed components mount, then exercises event counts through
reorder, retirement, and remount. Newly proven locals retain the existing
potential capability and SSR/client input markers; this optimization does not
remove the identity metadata needed by late signals.

The SSR work observation renders two orders of 100 keyed rows. Each row reads
its opaque callback once and renders matching text, title, and input values.
The primitive lane makes zero `ssrSignalValue`/`ssrSignalControlValue` entries;
the opaque control makes 600/200 entries respectively. The latter includes the
value entry made inside each control adapter. Real handles remain a separate
positive control. Clean and instrumented public results must agree exactly;
instrumented bundles never contribute byte measurements. No timing threshold
or budget changes are added.
