# Activity parity and performance audit

Audit started on 2026-08-21 from Octane commit
`1ac62305379c6ee735580ce34886142dd806d29c`, in an isolated worktree. That local
merge commit has byte-identical runtime/compiler source, package manifest, and
lockfile to the public upstream baseline
`2d2f638b5da4ccb9a5ec46c5cea7b9c52c059192`. PR preparation used the public baseline
to exclude three unrelated inherited test/changeset files without changing the
measured source. Benchmark reproduction commands use that public commit; raw
audit results retain their original local-merge provenance.

The React references are the repository's [pinned upstreams](../packages/octane/audit/react-upstreams.json):
stable `v19.2.7` (`6117d7cca4906492c51fe6a03381e35adfd86e7d`) and canary
`b740af2510de1e19fcb399abb862af26ff95ac80`. The current
[React Activity reference](https://react.dev/reference/react/Activity) was also
checked.

This audit concerns the observable component contract: preserved state and host
identity, visibility, refs, effects, suspension, authoring, and server output.
It does not claim that Octane implements React's Fiber scheduler, every
experimental Activity surface, or every upstream test. The repository's
[differences contract](./differences-from-react.md) remains authoritative.

## Verified contracts and regression coverage

| Area | Behavior covered | Executable evidence |
| --- | --- | --- |
| Identity and effects | `visible` is the default. Hide/reveal preserves compatible DOM, component state, and uncontrolled input values. Layout/passive effects disconnect and reconnect; hiding alone does not disconnect insertion effects. Initially hidden descriptor children register deferred effects on reveal even when the same descriptor is reused. An inner hidden Activity stays inactive when its outer Activity reveals. | [Activity lifecycle](../packages/octane/tests/activity.test.ts), [DOM conformance](../packages/octane/tests/conformance/activity-dom.test.ts) |
| Public refs | Initially hidden host refs are not attached. Hiding disconnects object/callback refs, honoring callback cleanup; revealing attaches the latest ref. Replacing a ref while hidden does not publish it, and hidden unmount does not repeat cleanup. Fragment refs inside the boundary follow the same visibility lifetime. | [DOM conformance](../packages/octane/tests/conformance/activity-dom.test.ts), [Fragment visibility](../packages/octane/tests/conformance/fragment-refs-activity.test.ts), [Fragment descriptors](../packages/octane/tests/conformance/fragment-refs-descriptors.test.ts) |
| Authored DOM values | Hidden roots remain hidden across descendant updates and Suspense resumes. Reveal restores the latest authored `display` and bare-text values, including removal of an authored display property. Overlapping Activity/Suspense owners cannot reveal one another's content. | [DOM conformance](../packages/octane/tests/conformance/activity-dom.test.ts), [Activity lifecycle](../packages/octane/tests/activity.test.ts) |
| Portals | Logical Activity ownership reaches deeply nested portals, newly inserted portal children, nested Activities, and portaled Suspense content. Revealing one owner does not override another hidden owner. | [DOM conformance](../packages/octane/tests/conformance/activity-dom.test.ts); see the canary scope below |
| Hidden suspension | Background suspension stays within the hidden Activity instead of replacing a visible sibling with an enclosing fallback. Resolved work remains hidden until reveal. A visible Activity still participates in normal Suspense handling. | [DOM conformance](../packages/octane/tests/conformance/activity-dom.test.ts), [universal Activity](../packages/octane/tests/universal-activity.test.ts) |
| Insertion-effect retries | A hidden attempt that suspends does not publish its queued insertion effects. Successful retries preserve memo/cached-child effects, invalidate superseded or omitted hooks, retain repeated custom-hook enqueues, and transfer pending work to a nested Activity that suspends. This queue guarantee does not make eager structural deletion transactional; see the limit below. | [DOM conformance](../packages/octane/tests/conformance/activity-dom.test.ts), [custom-hook helper](../packages/octane/tests/conformance/_fixtures/activity-dom-insertion-helpers.ts) |
| Public API and compiler | Direct, imported-alias, namespace, dynamic-tag, spread-configured, children-prop, returned-JSX, and `createElement(Activity, …)` forms resolve to the same boundary. Props retain source-order precedence, including explicit keys before or after spreads on runtime-selected tags; nested children override a children prop; changing the effective key resets state. Unrelated module, callback, and block-scoped bindings named `Activity` stay ordinary components. The client/server export types accept JSX without changing sentinel identity. | [Authoring matrix](../packages/octane/tests/activity-authoring.test.ts), [TSRX fixture](../packages/octane/tests/_fixtures/activity-authoring.tsrx), [returned JSX](../packages/octane/tests/_fixtures/activity-authoring-returned.tsx), [lexical shadows](../packages/octane/tests/_fixtures/activity-authoring-shadowed.tsx) |
| SSR and hydration | Visible content renders normally. Hidden children are not evaluated or serialized; hydratable output retains an empty internal range, while static markup omits it. Both stream transports finish without executing hidden descriptor children. Hydration adopts visible server nodes and can populate an empty hidden range without consuming a neighboring server node. | [Authoring matrix](../packages/octane/tests/activity-authoring.test.ts), [Activity hydration](../packages/octane/tests/hydration/activity-hydrate.test.ts), [SSR contract](./ssr.md#how-it-works) |
| Universal renderers | Capability-gated visibility preserves accepted hosts, state, resources, and insertion effects while disconnecting public refs, events, and layout/passive effects. Hidden suspension retains the accepted range and queued state; rejection reaches the enclosing catch boundary. Aborted preparation, rejected host work, recreated instances, and physical attachment notifications cannot expose an unaccepted or hidden ref. | [Universal Activity](../packages/octane/tests/universal-activity.test.ts), [retained Suspense](../packages/octane/tests/universal-retained-suspense.test.ts), [host attachments](../packages/octane/tests/universal-host-attachments.test.ts), [architecture](./universal-renderer-architecture.md#6-nested-owners-and-renderer-identity) |
| ViewTransition | Transition-driven reveal/hide fires enter/exit in both nesting orders. Visible updates fire update; hidden-only updates do not activate an animation. Native Chromium tests observe fulfilled transition readiness, real new/old pseudo-element animations, and the same edited input through hide/reveal. | [Conformance](../packages/octane/tests/conformance/view-transition.test.ts), [native browser integration](../packages/octane/tests/browser/activity-view-transition/activity-view-transition.test.ts) |

The lifecycle/ref reference is React's stable
[Activity tests](https://github.com/facebook/react/blob/v19.2.7/packages/react-reconciler/src/__tests__/Activity-test.js)
and [commit implementation](https://github.com/facebook/react/blob/v19.2.7/packages/react-reconciler/src/ReactFiberCommitWork.js).
Hidden suspension is grounded in the stable
[Activity/Suspense tests](https://github.com/facebook/react/blob/v19.2.7/packages/react-reconciler/src/__tests__/ActivitySuspense-test.js).
The [pinned canary commit implementation](https://github.com/facebook/react/blob/b740af2510de1e19fcb399abb862af26ff95ac80/packages/react-reconciler/src/ReactFiberCommitWork.js)
also disconnects and reconnects Fragment refs inside hidden Activity trees.

### Stable versus canary portal scope

The deeper portal expectations come from
[ReactDOMActivity-test.js at the pinned canary](https://github.com/facebook/react/blob/b740af2510de1e19fcb399abb862af26ff95ac80/packages/react-dom/src/__tests__/ReactDOMActivity-test.js),
including portals below host elements, insertion while hidden, nested hidden
ownership, and a Suspense fallback inside a portal. A direct React 19.2.7 DOM
probe left a deeply nested portaled host visible when its logical Activity hid.
Stable React is therefore not the oracle for that particular group; the Octane
tests deliberately target the later pinned behavior. This distinction must be
preserved when updating React versions or adding differential tests.

## Intentional differences and limits

- **Hidden work is synchronous.** Octane renders hidden children in the same
  pass. It has no React offscreen/idle lane, general time slicing, or equivalent
  background-priority/coalescing guarantee. Compatible committed state and
  visibility do not imply matching render counts or completion timing. See
  [scheduling differences](./differences-from-react.md#scheduler-synchronous-two-priorities).
- **Hydration is not selective hydration.** Matching visible HTML, hidden
  server omission, full-root adoption, and streamed-boundary adoption are
  supported contracts. Adding an always-visible Activity does not give Octane
  React's independently prioritized hydration units or synthetic event replay.
  React's partial-prerender/resume machinery is not part of this parity claim.
  See [SSR and hydration differences](./differences-from-react.md#ssr-and-streaming).
- **Other framework differences still apply.** Compiler-keyed hooks, inferred
  dependencies, parallel `use()`, native events, synchronous initial mounting,
  and the absence of classes, legacy roots, React Server Components, and
  StrictMode double invocation are unchanged. Hidden Activity is a suspension
  boundary, not an error boundary.
- **General structural deletion is not an atomic hidden transaction.** The DOM
  runtime still mutates same-identity trees eagerly. If a hidden render removes
  an already-committed child and a later sibling suspends, that child's DOM,
  state, and insertion cleanup can be destroyed before the Activity knows the
  attempt is incomplete. React 19.2.7 retains the old child and defers cleanup
  until successful completion; canceling the removal does not recreate it.
  Discarding queued effects cannot undo a cleanup that has already executed.
  This is part of the existing
  [per-swap Suspense limitation](../packages/octane/audit/SUSPENSE_DIVERGENCE.md#4-per-swap-off-screen-rendering--cross-boundary-reveal-gap--closed),
  not a closed parity gap. A general fix needs owner-state staging/rollback for
  branch removal, descriptor-kind changes, component/key replacement, lists,
  and portals. An `@if`-only delay or fresh-tree preflight would not preserve the
  full state/identity contract. See the
  [deferred-commit plan](./transition-deferred-commit-plan.md).

The deletion counterexample is small: first commit `Before`, whose insertion
effect logs mount/cleanup; then remove it while `Later` reads an unresolved
promise. React's expected log is unchanged until that promise resolves. Restoring
`showBefore` before resolution must cause neither cleanup nor remount.

```tsx
<Activity mode="hidden">
  {showBefore ? <Before /> : null}
  <Later promise={promise} />
</Activity>
```

## Validation record

The first new DOM conformance run used the unchanged Octane baseline and failed
all 13 cases in both compiler modes: **26 intended semantic failures**. They
exposed attached hidden refs, stale display/text restoration, visible portaled
content, and an outer fallback activated by hidden suspension. The universal
tests likewise failed before their owning runtime was corrected. A final frozen
baseline recheck reproduced four state/rejection/renderer-region failures,
including state owned directly by the Activity body.

| Gate | Result |
| --- | --- |
| New DOM regressions against the original runtime | 26/26 failed for the intended contracts |
| Final Activity DOM conformance, development + production | **64/64 passed**, including insertion-abort and nested retry cases |
| Universal Activity and neighboring universal suites, development + production | **652/652 passed across 34 files** |
| Native Chromium Activity/ViewTransition integration, development + production | **4/4 passed**; the same four cases failed before the visibility/animation-handle fixes |
| Unified Activity benchmark regression guards | **32/32 passed** on the candidate; frozen baseline failed exactly the three quadratic range-work guards |
| Final integrated Activity, compiler/authoring, SSR, hydration, Fragment, Suspense, conditional-hook, and ViewTransition run | **971/971 passed across 57 files** |
| Broad core run and corrected environment cohorts | **13,639 passed assertions across 861 file executions** in the diagnostic aggregate; **6 environment-failed executions / 8 assertions remain**. This is not a single green full-suite invocation. |
| Full workspace suite and normal native-parser configuration | **Not established by this audit run** |
| Strict core typecheck | **Passed** using the unchanged core tsconfig with a paths overlay to real installed Volar declarations |
| Scoped Activity typecheck | **Passed** with `tsrx-tsc` and real dependency declaration paths; the broader changed-file graph still reports pre-existing universal-object and ViewTransition fixture typing errors |

The worktree could not install the locked native parser dependencies: the
registry returned HTTP 403, including the approved retry. Existing installed
dependencies were reused. The local validation config used the supported
`parser.browser.js` adapter, the worktree's actual compiler/runtime sources, and
the root configuration's renderer-boundary registrations. The recorded
universal command was:

```bash
./node_modules/.bin/vitest run --config .test-scratch/activity-audit/vitest.config.mjs packages/octane/tests/universal-*.test.ts --reporter=dot --silent=passed-only
```

That config is an ignored, environment-specific workaround, not a replacement
for the normal repository gates. A clean installation should repeat the
focused files through the root Vitest configuration, then run the required
typecheck and full-suite checks. File-level coverage here does not automatically
close every entry in the [React conformance ledger](./react-parity-coverage.md).

The initial broad invocation passed 13,260 assertions and failed 47 across 57
file executions. Every failure was classified against the root configuration and
frozen-source controls:

| Cause | Failed file executions | Failed assertions | Follow-up |
| --- | ---: | ---: | --- |
| Missing differential React precompile | 40 | 0 | Correct root global setup; differential/profile rerun passed 43 files / 327 tests |
| Profile-only fixtures run in ordinary projects | 6 | 34 | Run once in the root-equivalent profile project; included in the 327 above |
| Missing native `oxc-tsrx` | 4 | 6 | Same failure with frozen and candidate compiler entry points; complete install still required |
| Missing Volar runtime dependencies | 3 | 0 | Real preserved dependency packages plus the repository's checked-in parser patch; language cohort passed 4 files / 64 tests |
| Unpatched parser / old esrap | 1 | 4 | Same four failures on frozen source; included in the repaired language cohort above |
| Borrowed pnpm install lacks workspace-package layout | 2 | 2 | Real workspace links in ignored scratch make all three transform controls pass on both revisions; normal installed-layout tests still need a complete install |
| Hydration timeout under the broad run | 1 | 1 | Both revisions passed in isolation; full file rerun passed 2 files / 42 tests |

No candidate-only source regression was isolated in that review. The ignored
`core-failure-classification.json` records the reports and exact aggregation;
the aggregate replaces rerun files and counts the profile project only once.
No fake package, ambient TSRX declaration, shared dependency modification, or
manifest/lockfile change was used to obtain these results.

## Performance measurement

The new [Activity benchmark](../benchmarks/activity/README.md) compiles the same
stateful fixture for production Octane and React. It measures visible/hidden
mounts, hide/reveal, visible and hidden updates, descendant state updates, and
nested visibility, with plain-tree controls. Every sample checks retained
identity, state, uncontrolled input values, visibility, and balanced effect
lifetimes before its timing is accepted.

Synchronous `*_commit` and completed-work `*_ready` results are separate because
React may defer or combine hidden work. The completed-work result includes
scheduling and readiness detection; it is not just framework CPU time. A
separate work-count pass measures runtime visits and actual DOM mutations.
Baseline and candidate must use the same fixture, production settings,
iteration count, browser, and dependency installation.

The completed [universal external-store control](../benchmarks/universal-external-store/README.md)
used two production `universal-native.ts` bundles differing only in
`universal-core.ts`, in baseline/candidate/candidate/baseline order with seven
samples per run (Node 26.4.0, macOS arm64, Apple M5 Max). All semantic gates
passed. Stable and inline subscription lifetimes remained 128 acquisitions and
128 releases; the changing-subscription control remained 37,248 of each; the
state-replacement work counter remained 3. Timing variation did not establish a
speedup or regression. The full native bundle changed from 165,508 to 166,264
minified bytes and from 45,908 to 46,115 gzip bytes (**+207 gzip bytes**). This
isolated control does not determine the final DOM bundle cost or Activity
browser ratios.

### Browser timings

Final measurements used Node 26.4.0, Chromium 149.0.7827.55, macOS arm64 on an
Apple M5 Max, React 19.2.7, Vite 8.1.5, esbuild 0.28.1, and the same supported
JavaScript parser fallback for both Octane revisions. Baseline and candidate retained the identical fixture,
installed dependencies, and production settings. The candidate source-content
hash was `30e6d2632fe06a679441af4dd35e0db3f79603cbc381488f8c7f1a2d060ad4be`;
this is a source hash, not a Git commit. The shared fixture hash was
`4c3f5357…`.

The first quiet paired run used eight measured samples per operation after three
warmups. Values below are the benchmark library's steady-window **scores in
milliseconds**, not full-sample means. React values are from the candidate's
same-toolchain run.

| Operation | Original Octane | Candidate Octane | React |
| --- | ---: | ---: | ---: |
| Visible mount | 1.12 | 0.98 | 1.54 |
| Hidden mount — synchronous commit | 1.12 | 1.12 | 0.06 |
| Hidden mount — completed work | 1.12 | 1.12 | 1.96 |
| Eight hide/reveal cycles | 2.80 | 4.14 | 1.42 |
| Twelve visible prop updates | 1.60 | 1.84 | 3.98 |
| Hidden prop burst — synchronous commit | 1.80 | 2.14 | 0.06 |
| Hidden prop burst — completed work | 1.80 | 2.14 | 0.80 |
| 256 hidden descendant setters — synchronous commit | 8.58 | 0.30 | 0.08 |
| 256 hidden descendant setters — completed work | 8.58 | 0.30 | 0.88 |
| Eight nested hide/reveal cycles | 5.44 | 7.88 | 1.90 |
| Twelve plain-tree prop updates | 1.62 | 1.76 | 3.94 |
| 256 plain-tree descendant setters | 0.24 | 0.28 | 0.46 |

A reverse-order Octane-only repeat used the same cached builds and 16 samples to
check drift. The hidden-setter improvement persisted: **9.271 → 0.286 ms, about
32× faster**. The repeat also confirmed costs that must not be hidden:

| Repeat control | Original | Candidate | Change |
| --- | ---: | ---: | ---: |
| Eight hide/reveal cycles | 2.957 ms | 4.300 ms | +45% |
| Eight nested hide/reveal cycles | 5.786 ms | 7.671 ms | +33% |
| Twelve plain-tree prop updates | 1.729 ms | 1.943 ms | +12% |

The repeated flat-toggle full-sample RME was 2.3% / 5.8% (baseline / candidate),
and nested-toggle RME was 2.9% / 6.7%. Sub-millisecond samples have substantially
larger relative error and timer quantization; raw samples, both RME measures,
means, medians, and percentiles are retained. React also moved between paired
runs, so small timing changes should not be given a causal explanation from
these scores alone. In particular, the plain-tree timing increase did not come
with additional named Activity helper calls or additional render/DOM work.

### Deterministic work and ordinary-tree controls

- **Hidden descendant batch:** `hideActivityRange` and descendant rehide calls
  fell from **256 each to 1 each**. Display enforcement fell from **65,536 to
  256**. All 256 component renders and state-attribute writes remain; style writes,
  row insertion, and row removal remain zero. This removes quadratic range work
  without skipping state updates.
- **Hide/reveal:** flat and nested workloads still perform exactly 4,096 style
  writes each, with no remounts. Component-render, effect-deactivation, and shared
  subtree-visit counts are unchanged. Ref-free boundaries do zero ref-manifest
  walks, and this no-insertion-effect fixture does zero speculative effect
  snapshots. The added work is per-boundary suspension/ref gating and authored
  display restoration/ownership bookkeeping, not extra DOM mutations.
- **Plain trees:** the prop-update control still performs 6,168 block renders,
  6,144 effect-hook calls, and 3,084 `setText` calls; the independent-setter control
  performs 256 / 512 / 256 respectively. None of the newly added named Activity
  helpers execute in either operation.
- **Ordinary refs:** cold shallow/deep replacement and mount/unmount scores were
  1.56 / 1.90 / 2.42 ms before and 1.56 / 1.86 / 2.38 ms after. Candidate
  after-Activity scores were 1.52 / 1.88 / 2.40 ms; keeping an unrelated hidden
  Activity live gave 1.58 / 1.88 / 2.54 ms. All semantic gates pass. Cold and
  after-last-Activity operations do zero Activity ref registration/owner searches.
  With an unrelated hidden Activity live, 3,072 shallow or deep ref replacements
  cause zero owner-discovery misses; 2,048 newly mounted blocks cause exactly
  2,048 misses. Negative ownership caching avoids repeated ancestor walks.

The benchmark adds 32 narrow deterministic ceilings for linear hidden work, no
extra DOM churn, cold ref/snapshot paths, and optional bundle reachability. The
unified `--quick --ratios activity` run passes all 32 on the candidate; the frozen
baseline fails exactly the three quadratic hide/re-hide/display-scan guards. It
does **not** add a wall-clock ceiling that would enshrine the slower toggle path,
nor loosen any existing absolute bundle-size budget.

### Compiler output and bundle cost

Direct mode-only Activity output is byte-identical to the frozen compiler:
the shared App emits 5,980 client bytes and 4,547 server bytes; the ordinary ref
fixture emits 4,080 client bytes. Simple, key-only, and spread-only generic
component controls are also unchanged. A 30-sample alternating same-parser
compiler probe measured a scoped client compilation cost of about 6%
(3.717 → 3.940 ms; paired-ratio RME 3.52%) for the Activity fixture's
binding-correctness analysis. Server and ordinary-component differences were
within noise. This is not a native-parser throughput result.

All five ordinary production bundle controls execute successfully and exclude
the optional Activity implementation. Cold descriptor registration avoided the
roughly 6 KB gzip retention found during the first implementation review. The
remaining shared correctness machinery still has a measurable size cost:

| Ordinary entry | Original gzip | Candidate gzip | Delta |
| --- | ---: | ---: | ---: |
| Specialized static root | 12,266 B | 12,577 B | +311 B |
| Reusable static root | 36,475 B | 36,993 B | +518 B |
| State-hook root | 37,620 B | 38,155 B | +535 B |
| Component-owned effects | 36,868 B | 37,406 B | +538 B |
| Plain element-descriptor root | 36,430 B | 36,933 B | +503 B |

The Activity application's production JavaScript grew from 151,808 to 157,850
bytes (+6,042 bytes) while adding the corrected contracts. The existing
bundle-reachability budgets remain authoritative; their normal-toolchain gate
still needs a complete installation. The borrowed fallback toolchain already
differs from some committed absolute budgets at the frozen baseline, so this
audit does not rewrite those budgets to fit its environment.

### Reproduction and remaining optimization work

Ignored local results are in `benchmarks/activity/dist/`: `baseline.json`,
`candidate.json`, the `*-repeat.json` pair, the `*-refs.json` pair, and the
`*-work.json`, `*-refs-work.json`, and `*-bundle.json` pairs. They include exact
source/toolchain hashes and semantic checks. The [benchmark README](../benchmarks/activity/README.md#run)
documents how to regenerate them from either revision.

The audit establishes a large hidden-update improvement, not universal
optimality. Visibility-only toggles still rerender and reconnect large retained
subtrees, and the corrected visibility bookkeeping adds cost. These measured
paths, shared bundle bytes, and the structural-transaction limitation above are
explicit follow-up work. Any future bailout must preserve the latest hidden
state, conditional hooks, current refs, insertion-effect retry ownership, and
the native animation contract now covered by the tests.
