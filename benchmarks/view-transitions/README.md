# View Transition optional cost and native work

This suite measures production bundle bytes, optional driver reachability, and
browser reads around native View Transitions. It reuses the published-API
minimal root/state fixtures and the native parity browser fixture. Its
byte/read runner does not measure latency, paint cost, garbage collection, or
V8 allocations. The recorded comparison describes the separate client hot-path
timing harness and its measurement limits.

```sh
node benchmarks/bench.mjs --quick --ratios view-transitions
BENCH_JSON=/tmp/vt-baseline.json node benchmarks/view-transitions/bundle.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
BENCH_JSON=/tmp/vt-candidate.json node benchmarks/view-transitions/bundle.mjs
```

The revision argument freezes the entire Octane package and compiler through
the established Activity benchmark helper. Baseline and candidate use the same
authored fixtures, dependencies, production options and machine. Source,
lockfile and bundle hashes plus tool/browser versions accompany the results.
The runner rejects a source change during measurements.

[Recorded comparison and measurement limits](./RESULTS.md) include the final
main/candidate revisions, byte and browser-work deltas, and timing distributions.

## Controls

- **Ordinary static root:** mounts authored text and unmounts it.
- **Ordinary stateful root:** dispatches a real button event, observes the state
  change, and checks layout-effect cleanup on unmount.
- **Active View Transition:** performs four separate text updates, waiting for
  each native animation to finish. Every update preserves the uncontrolled
  input and its draft, produces the expected text, and actually animates.

Both ordinary bundles must exclude the optional transition driver and DOM
staging adapter. Their
measured bytes execute through the existing bundle semantic oracle and again
in Chromium while instrumenting native capture, rect reads and computed-style
reads. All three observed counts remain zero for those ordinary workloads.

The positive fixture must retain the driver. A clean minified pass and an
observed readable production pass execute the same fixture and must return the
same output, identity, draft and animation observations. Instrumentation wraps
browser APIs and delegates every call to the original method. Counters include
the fixture's public pseudo-element style observations, so they describe the
complete scenario rather than only internal framework work.

The active bundle includes the browser fixture's observation code and controls;
its absolute size is not a minimal framework import size. Compare its baseline
and candidate with the same fixture, and use the ordinary bundles for optional
cost. Byte deltas are reported explicitly instead of introducing a timing or
size threshold for the added functionality.

## Native behavior regressions

```sh
pnpm exec vitest run --project=octane-events-browser packages/octane/tests/browser/view-transition-parity/view-transition-parity.test.ts
```

The browser suite runs both development and production compiler modes. It
checks visual-only mutations, nested disabled boundaries, old/new animation
classes, combined types and `none`, native CSS types, refs and pseudo styles,
cleanup, authored styles,
outside pointer interaction, urgent interruption, pending Navigation API work,
and newly loaded font readiness including layout effects and host refs.

A delayed real native update callback checks that preparing a commit preserves
the previous HTML, node identities, controlled values, event handlers, insertion
effects, layout effects and refs. MutationObserver allows only temporary View
Transition names/classes before replay. The released update checks compiled
and descriptor text, keyed reorder/removal/insertion and retained row identity.
It also preserves a dirty textarea while changing its default, updates a
controlled select's options, and keeps existing custom-element property,
attribute and connection callbacks quiet during preparation. A gated update
interrupted by urgent work must leave the urgent DOM and effect lifetime intact.
Focused editable rows preserve focus, selection and scroll through a reorder
without native `moveBefore`. A custom-element callback that refreshes the same
root must not strand a later descriptor update.

`OCTANE_VT_BROWSER_PACKAGE=/absolute/frozen/packages/octane` runs the same
fixture against a frozen runtime. The original runtime fails the readiness,
class, ref, cleanup, interaction and native CSS type observations in both
modes. Native snapshots, promises and animation objects are never replaced by
a View Transition mock.

The font tests reuse the existing
`benchmarks/tanstack-com/octane/public/fonts/Inter-latin.woff2` fixture, with no
new copy or external request. Inter is by the Inter Project Authors and uses
the [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt).

## Supplementary server comparison

```sh
BENCH_JSON=/tmp/vt-ssr.json node benchmarks/view-transitions/ssr.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
```

This separate paired runner compares ready renders and suspended streams,
reporting warm batch timing distributions, wire/script bytes and the combined
server bundle. The baseline and current checkout use the same compiled fixture
and dependencies. It is a focused server comparison rather than a browser,
backpressure or concurrent-request benchmark; see [the recorded limits](./RESULTS.md).

The page controls surround one tiny boundary with 200 or 1,600 unrelated
four-host rows (about 25 KB or 200 KB). Matching plain pages isolate ordinary
serialization cost; their `overflow-x-auto` classes also exercise annotation
precheck false positives. A 200-row trusted-HTML control measures the parser
fallback separately. All controls verify the complete row count, final row link,
authored content, and absence of residual transition candidates before timing.

## Ordinary inline-style control

Element scopes use a shared stylesheet rule; they add no declaration-ownership
hooks to ordinary style setters. Reuse all ten cases and four operations from
`style-literals-work.mjs`
with the same authored fixture and the selected revision's complete package
and compiler:

```sh
BENCH_JSON=/tmp/vt-style-baseline.json node benchmarks/view-transitions/style.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
BENCH_JSON=/tmp/vt-style-candidate.json node benchmarks/view-transitions/style.mjs
```

This builds readable and minified production assets, checks optional driver and
DOM staging exclusion, executes the existing CSS/identity/work gates, and records
source, fixture, lockfile and asset hashes plus raw and gzip bytes. Temporary
servers and assets are removed after the run. Use the same Node version for both
variants: gzip output can differ across Node/zlib versions.

Set `WORK_CASES=single,multi,generic WORK_SAMPLES=20` for the existing
uninstrumented timing pass; leave `WORK_SAMPLES` unset for deterministic work
only. Alternate baseline–candidate–candidate–baseline on a quiet machine.
These timings measure mount and early updates in fresh contexts, not steady
state, and do not measure heap allocation or browser layout cost. The generic
case is the control for machine variation. Source or fixture changes during a
run fail the wrapper.

## Ordinary js-framework benchmark

The minimal root controls do not exercise a real table's per-row work. Run the
existing TSRX and JSX benchmark applications through their unchanged canonical
harness with the selected complete Octane package and compiler:

```sh
BENCH_JSON=/tmp/vt-js-framework-main.json node benchmarks/view-transitions/js-framework.mjs 8 --octane-revision=fe1b2b7e6774c0bb00170ceecd5a5432fbef81c0
BENCH_JSON=/tmp/vt-js-framework-candidate.json node benchmarks/view-transitions/js-framework.mjs 8
```

The optional positional argument is measured samples per operation (default
eight). Both builds use the same current fixture sources, dependencies, Vite
production settings, and esbuild minifier. Source and compiler hashes, fixture
and compiled-input hashes, the lockfile, harness, emitted asset hashes, raw/gzip
JavaScript bytes, and Node/tool/browser versions accompany the raw harness
results. Source, fixture, harness, or lockfile edits during a run fail the wrapper.
Temporary preview servers and build assets are removed afterward; the shared
revision helper retains its ignored source snapshots for reuse.

Each dialect runs under its canonical `octane-tsrx` or `octane-jsx` target name,
so all existing DOM/identity/event checks, direct-insertion checks, and production
call-count limits remain active. No guard is relaxed. The wrapper runs both
dialects even when the first fails; it retains the original standard output and
error alongside a nonzero exit status. A failed canonical run may produce no
timing JSON, in which case the wrapper records its failure without inventing
partial timing results.

The Chromium integration CI lane runs this wrapper with one measured sample per
operation and uploads its raw result even when a guard fails. This enforces the
existing correctness, insertion, and call-count limits on pull requests; one
sample is not evidence for a timing claim and introduces no timing threshold.

Run baseline–candidate–candidate–baseline sequentially on a quiet machine using
the same Node version and `CPU_THROTTLE` setting. The canonical harness performs
three warmup cycles, measures synchronous click/commit time, and checks calls
separately in a jitless browser. These are local timings excluding paint, not the
official benchmark's Chrome timeline scores. Call counts are deterministic work
evidence, not CPU-time percentages; differences within timing variation remain
inconclusive.

## Scoped native work

The separate scoped runner reuses the element-scope browser fixture. It reports
bytes and browser API calls for a single scope, siblings, nested scopes, and a
mixed document/element batch. Minified and instrumented readable builds must
agree on native owners, successful promises, persistent hosts, final text and
pseudo-element animation targets. Instrumentation delegates to native APIs;
counts include the fixture's public pseudo-style observations.

```sh
VT_SCOPES_BYTES_ONLY=1 BENCH_JSON=/tmp/vt-scopes-baseline.json node benchmarks/view-transitions/scopes.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
BENCH_JSON=/tmp/vt-scopes-candidate.json node benchmarks/view-transitions/scopes.mjs
```

The baseline ignores the new `scope` prop and supplies only a comparable fixture
byte count. It cannot pass the scoped behavior oracle. This is the cost of new
functionality, not a latency comparison. The existing document transition
runner remains the baseline positive native control.

The SSR runner also retains its four ordinary/document controls and adds ready
and streamed element scopes. The candidate must emit exactly one persistent
section with `vt-scope="element"` and the shared stylesheet rule declaring
`view-transition-scope:all!important`. Ready response byte counts include both
`RenderResult.css` and `RenderResult.html`; streamed CSS is already in the response.
The same authored input runs on the baseline, where the scope prop is ignored;
its wire-size and timing differences likewise include new functionality.

## DOM preparation work

`dom-stage.mjs` isolates deterministic adapter costs in native Chromium. It runs
the same append, sibling traversal, clear, radio association, and nested-template
scenarios against selected source revisions. All counters delegate to the native
operation; each case also verifies planned and committed DOM state and retained
host identity. Public renderer integration remains covered by
`view-transition-host-state.test.ts` and the staging suites.

```sh
node benchmarks/view-transitions/dom-stage.mjs --octane-revision=5c3823293 > /tmp/vt-dom-stage-baseline.json
node benchmarks/view-transitions/dom-stage.mjs > /tmp/vt-dom-stage-candidate.json
```

The recorded feedback comparison is in `measurements/dom-stage-feedback.json`.
For 1,024 retained hosts plus 1,024 inserts, copied array slots fall from
3,672,576 to zero, searched array slots from 2,100,224 to zero, and clearing uses
one parent write instead of 2,048 individual removals. The radio case performs
48 association reads across 24 controls and 1,024 unrelated elements: imported
projection nodes fall from 51,694 to 1,102. Discovering two nested templates
among 2,049 ordinary elements uses zero JavaScript child collections instead of
3,084. These are operation counts, not elapsed-time or allocation measurements.
The candidate's adapter hash identifies the measured working tree exactly;
`workingTree` distinguishes it from a selected commit snapshot.

## Ordinary effect cleanup after a transition

`effect-cleanup.mjs` reuses the authored JSX and TSRX effectful-list applications
and their shared, exact lifecycle contract. Each dialect clears 1,000 rows,
replaces all 1,000 keys, and removes 100 scattered rows in fresh cold and
installed-driver contexts. The original preparation, counter reset, and 50ms
settling boundaries remain intact; effect cleanup, callback-ref cleanup, layout
reads, and final row counts must all match the canonical benchmark.

```sh
BENCH_JSON=/tmp/vt-cleanup-before.json node benchmarks/view-transitions/effect-cleanup.mjs --octane-revision=ead781345500f7245d9efbb076cdfc2313b474eb
BENCH_JSON=/tmp/vt-cleanup-after.json node benchmarks/view-transitions/effect-cleanup.mjs
node benchmarks/bench.mjs --quick --ratios view-transitions
```

Both modes execute identical minified assets. The idle primer uses public Octane
APIs to complete a real native transition: `ready`, `updateCallbackDone`, and
`finished` must fulfill, `onUpdate` must run once, and the primer must fully
unmount with no remaining transition animation. The cold primer makes the same
plain-root updates. The fixture loads only after the primer has finished.

A jitless Chromium context captures precise function coverage around one
original operation. The runner verifies each executed script against its emitted
SHA-256 hash and records every outermost function count, complete coverage
ranges, total calls, and the idle-minus-cold total-call delta. Initial and setup
counts are excluded. Nested basic-block ranges are retained as evidence but not
summed as extra function calls. The installed driver must expose exactly one
`stageTeardown` coverage range, and ordinary cleanup must enter it zero times.
The standalone runner and 12 ratio guards enforce this limit; the Chromium CI
lane runs the standalone guard and uploads its JSON even on failure.

Results include source, compiler, fixture, compiled-input, lockfile, harness,
emitted-asset, and tool/browser provenance. Edits during a run fail it. Temporary
servers and assets are removed afterward. The selected revision helper retains
ignored package snapshots. These are work counts, not timing, instruction,
allocation, or native DOM measurements; the total-call delta does not need to be
zero. An additional 18 ratio guards limit each operation's total calls and each idle case's nonnegative excess over
its cold control to the measured candidate plus 32 calls. This allowance is
smaller than one extra call for each of the smallest 100 removed rows.
`effect-cleanup-budget.json` records the calibration source and toolchain;
updates require fresh semantic and work evidence. The standalone CI runner
enforces these same ceilings.

The exact before/after comparison is recorded in
[`measurements/effect-cleanup.json`](measurements/effect-cleanup.json). Cold work
is unchanged; each dialect removes 2,000 function entries for clear/remount and
200 for scattered removal, with the original lifecycle snapshots preserved.
