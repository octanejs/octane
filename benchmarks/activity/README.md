# Activity lifecycle and hidden work

A production-browser comparison of Octane's `<Activity>` and React's public
Activity API. Both targets compile the **same `App.tsrx` source**: Octane uses
its production compiler; React resolves the public hook import to React and uses
`@tsrx/react` followed by the repository's production React Compiler preset.
There is no StrictMode or hand-written substitute for Activity.

The fixture has 256 independently stateful rows, each with a layout effect, a
passive effect, an uncontrolled input, and authored `display: inline-block`.
The nested case divides those rows among 16 inner Activities, without inserting
host wrappers that would hide the cost of overlapping host ownership.

| Operation | Measured work |
| --- | --- |
| `mount_visible` | Mount all rows and connect their effects. |
| `mount_hidden_commit`, `mount_hidden_ready` | Initial hidden commit, then actual completion of every hidden row. |
| `hide_reveal` | Eight complete hide/reveal cycles, including effect disconnect/reconnect. |
| `visible_updates` | Twelve distinct visible prop updates inside Activity. |
| `hidden_burst_commit`, `hidden_burst_ready` | Twelve urgent shell commits while hidden content receives new props; then all hidden rows reach the final generation. React may coalesce its background work. |
| `hidden_descendant_updates_commit`, `hidden_descendant_updates_ready` | One batch of 256 retained public state setters while their Activity is hidden; then every row reaches its new state. |
| `nested_hide_reveal` | Eight cycles of outer hide → inner hide → outer reveal while inner remains hidden → inner reveal. |
| `plain_updates` | The same twelve visible updates without any Activity boundary. |
| `plain_descendant_updates` | The same 256 independent state setters without Activity; a control for the shared component scheduler. |

## Semantic and measurement controls

Every sample asserts **every** row's text, generation, local state, computed
visibility, DOM identity, and uncontrolled input value. Effect setups and
cleanups must match the operation exactly. Hidden samples then reveal outside
the timer and must restore authored display, show the latest hidden state, and
reconnect all effects once. A real button click must still update the preserved
component. Unmount must empty the root and balance every effect lifetime.
An additional untimed gate checks the intermediate nested visibility states.

Root creation and sample preparation are outside the timer. The synchronous
timer includes Octane's public `drainPassiveEffects()` after `flushSync`, matching
the established effectful-list benchmark and React's sync-commit effect dispatch.
It does not force React's offscreen scheduler to become synchronous. Separate
`*_ready` measurements end only when the actual DOM and effect state are ready;
they include scheduler delay and completion detection, not just framework CPU.
The synchronous and completed-work numbers must not be substituted for one
another. Three warmup samples precede the requested samples. Optional explicit
Chromium GC runs before each sample, outside its timer.

`work.mjs` uses a separate unminified production build and jitless Chromium
precise-call coverage. It records Activity range visits, display enforcement,
effect deactivation, and block renders without probes in component render
bodies. A separate MutationObserver pass counts actual style/state writes and
row insertion/removal. Both passes retain the semantic controls. The
`activity-work-model` target provides row/update denominators and a one-flush
denominator for hidden descendant range scans. These support reviewed ratio
guards; no timing budget should be guessed before a representative paired run.

## Ordinary-ref and optional-bundle controls

The ref controls use a **separate entry and fresh browser realms**, so the cold
lane has never rendered Activity. The after-Activity lane first mounts, hides,
reveals, and unmounts a small Activity in another root. A third lane keeps a
separate hidden Activity mounted throughout the measurement. All three perform the
same ordinary, Activity-free workload: twelve replacements of 256 cleanup-bearing
callback refs, the same replacements under sixteen additional component layers,
and eight complete mount/unmount cycles. Every attachment/cleanup pair must be
balanced; replacement preserves every host node and leaves each callback pointing
at the current element. The deeper lane makes repeated ownership-ancestor walks
visible. `refs-work.mjs` observes the same public work through production call
coverage. These are matched ordinary-tree controls, not a comparison against the
old runtime's incorrect Activity ref-disconnection behavior.

`bundle.mjs` reuses the existing bundle-reachability suite's specialized root,
reusable root, state-hook, and component-owned-effect fixtures and their exact
executable jsdom oracles. It adds an ordinary `createElement` descriptor root
using the reusable-root oracle. Each measured production IIFE must execute before
raw/gzip/Brotli bytes are reported. An unminified diagnostic checks whether the
optional Activity implementation was retained; generated source is saved under
`dist/bundle-controls`. Direct production compiler-output sizes and hashes for
the two browser fixtures are reported separately. These checks complement, and
do not replace, the broader existing bundle-reachability byte budgets.

## Hidden caught-error reveal scaling

The Octane-only caught-reveal lane mounts either 512 or 4,096 independent public
`@try`/`@catch` boundaries inside an initially hidden Activity. Its report lane
throws one distinct error per boundary; the matched control renders the same
component and text shape without throwing. Root creation, hidden rendering, and
optional GC all happen outside the timer. The timer covers only the public
hidden-to-visible render and its root `onCaughtError` reports.

Every sample verifies that hidden catches publish no reports, reveal publishes
each report exactly once in FIFO order, visible text and output identity survive,
and unmount empties the root. The large target is normalized to the small work
count and compared against that small target, preventing repeated per-action
queue searches from returning without relying on a machine-specific absolute
timing ceiling.

## Regression guards

The unified runner has 34 guards for this suite: 33 deterministic work and
semantic guards for coalesced linear hidden-descendant work, retained rows and
bounded display writes, cold ref and insertion-recovery walks, cached ordinary-ref
ownership, and optional Activity bundle reachability, plus the normalized
caught-error reveal scaling guard. Ordinary updates also forbid snapshots of
unchanged keyed list structure. The guards run only after the semantic gates pass.

The initial audit deliberately added **no absolute wall-clock timing ceiling**.
The caught-error reveal lane now adds a same-run normalized scaling ceiling; it
compares the large target with the small target instead of pinning a
machine-specific duration. The hidden setter improvement is substantial, but
repeated hide/reveal is slower and the plain-tree timing change is not attributed
to a specific helper. Those costs remain reported in the audit instead of setting
a permissive absolute timing ceiling. Existing bundle byte budgets remain
unchanged; their normal-toolchain validation is still required after the audit's
parser dependency limitation is resolved.

## Run

```bash
node benchmarks/bench.mjs --quick activity
node benchmarks/bench.mjs --ratios activity
node benchmarks/activity/run.mjs 8
node benchmarks/activity/work.mjs
node benchmarks/activity/refs.mjs 8
node benchmarks/activity/refs-work.mjs
node benchmarks/activity/bundle.mjs
node benchmarks/activity/caught-reveal-run.mjs 8
pnpm exec tsrx-tsc --noEmit -p benchmarks/activity/tsconfig.json
```

The browser scripts accept `--target=octane-tsrx` or `--target=react`, and `--no-build`
reuses their existing matching production build. `BENCH_JSON` writes the shared
result contract, including raw timing samples, semantic checksums, browser and
tool versions, lockfile hash, and the exact Octane source hash.

To compare a runtime change with a commit that predates this benchmark, pin the
**entire Octane package and compiler**, while retaining the same fixture and
installed dependencies. The examples use the public upstream baseline
`2d2f638b5da4ccb9a5ec46c5cea7b9c52c059192`. Its runtime/compiler, package manifest,
and lockfile are byte-identical to the local merge commit used for the original
audit measurements; only unrelated inherited tests and a changeset differ.

```bash
BENCH_JSON=benchmarks/activity/dist/baseline.json node benchmarks/activity/run.mjs 8 --octane-revision=2d2f638b5da4ccb9a5ec46c5cea7b9c52c059192
BENCH_JSON=benchmarks/activity/dist/baseline-work.json node benchmarks/activity/work.mjs --octane-revision=2d2f638b5da4ccb9a5ec46c5cea7b9c52c059192
BENCH_JSON=benchmarks/activity/dist/candidate.json node benchmarks/activity/run.mjs 8
BENCH_JSON=benchmarks/activity/dist/candidate-work.json node benchmarks/activity/work.mjs
BENCH_JSON=benchmarks/activity/dist/baseline-refs.json node benchmarks/activity/refs.mjs 8 --octane-revision=2d2f638b5da4ccb9a5ec46c5cea7b9c52c059192
BENCH_JSON=benchmarks/activity/dist/candidate-refs.json node benchmarks/activity/refs.mjs 8
BENCH_JSON=benchmarks/activity/dist/baseline-bundle.json node benchmarks/activity/bundle.mjs --octane-revision=2d2f638b5da4ccb9a5ec46c5cea7b9c52c059192
BENCH_JSON=benchmarks/activity/dist/candidate-bundle.json node benchmarks/activity/bundle.mjs
```

The revision option extracts `git archive` into the ignored `dist/revisions`
directory and resolves Octane's public exports and compiler from that snapshot.
The normal run explicitly resolves those same exports from the current worktree,
even when its dependency directories are linked from another checkout. Build
and result paths for the snapshot and working tree are separate. Run baseline
and candidate sequentially on the same machine with identical iterations and
toolchain. Treat timing changes within observed variance as inconclusive.

`OCTANE_ACTIVITY_REVISION=<commit>` supplies the same pin to all child scripts
when using the unified runner; an explicit `--octane-revision` takes precedence.

### Audit environment

The [Activity parity audit](../../docs/activity-audit.md) records the findings
and limits of the initial run. That worktree could not install the locked native
`oxc-tsrx` parser because the registry returned HTTP 403. Its ignored
`dist/use-js-parser.mjs` Node loader redirects `#octane/compiler-parser` to the
selected compiler's supported sibling `parser.browser.js` and sets
`OCTANE_ACTIVITY_PARSER` in the result metadata. Both the frozen revision and
working-tree builds used that same parser policy and dependency installation:

```bash
BENCH_JSON=benchmarks/activity/dist/candidate.json node --import ./benchmarks/activity/dist/use-js-parser.mjs benchmarks/activity/run.mjs 8
NODE_OPTIONS='--import=/absolute/path/to/octane/benchmarks/activity/dist/use-js-parser.mjs' node benchmarks/bench.mjs --quick --ratios activity
```

The frozen-baseline guard check used `OCTANE_ACTIVITY_REVISION=1ac62305379c6ee735580ce34886142dd806d29c`
and `--results-dir=benchmarks/activity/dist/ratio-baseline`; it failed exactly the
three quadratic-work guards. The matching working-tree check used
`--results-dir=benchmarks/activity/dist/ratio-candidate` and passed all 32. Their
merged raw result files are `dist/ratio-baseline/activity.json` and
`dist/ratio-candidate/activity.json`.

The loader is local audit plumbing, not a replacement for the normal compiler.
Use the package-default commands above in a complete installation, and do not
compare timing or byte results across different parser/toolchain configurations.
