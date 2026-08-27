# Experimental scoped signals: implementation evidence

This remains an implementation experiment and a draft pull request, not a
release or merge recommendation. The [API guide](experimental-scoped-signals.md)
describes the consolidated contract; the
[accepted plan](plans/2026-08-27-experimental-scoped-async-signals-plan.md)
records the broader acceptance gates. Required checks skipped because the PR is
a draft are not validation. No packages have been published.

The consolidation baseline is `cd9ed33754bfc3eeb144ba256dc9b437614e3e92`, the
previous head of this experiment. New reports use the `consolidation-` prefix
and record their tested source hashes. Earlier reports, including files named
`*-final`, describe that previous implementation and are retained as historical
evidence. Their timings and expanded model runs are not silently attributed to
the changed source. The primary checkout was not modified.

After measurement, upstream `f036bad8d1e0e095694b8bbc71e95d13e01a7330` was
incorporated. It changes only the website homepage and its smoke test. Measured
runtime, compiler, dependency, and workload hashes remain unchanged.

## Consolidated contract

The engine still uses the public `alien-signals/system` API at exactly 3.2.0.
It keeps explicit data owners, branded `$` handles, immediate synchronous
writes, copied canonical query arguments, revocable async attempts, and removal
of request entries after their last selector leaves. The existing
`@octanejs/alien-signals` binding and its separate 1.0.4 dependency are unchanged.

Opted-in renderer modules now activate a versioned private capability before
authored rendering can begin. Runtime collection surrounds the actual component
invocation, including parameter defaults, body setup, and returned-output
normalization. Existing compiler body brackets join that collection. Native
inferred `useMemo` callbacks retain lexical dependency inference and additionally
validate and replay their native read evidence. Explicit arrays and `null`
keep their existing contracts; effects and events remain imperative.

`isPending` tests whether its expression can produce a value, not whether an
owner has background activity. A successful `latest` fallback is available.
Snapshots expose refresh and stream activity separately. `latest` retains a
whole successful calculation, including the identity and commands belonging to
that result. Retiring a contributing live owner invalidates the retained value,
even after a pending or failed branch has dropped its old dependencies. Pending
consumers wake on retirement, and equal replacement values replace their
ownership provenance. Serialization rejects revoked live origins, including
inside reentrant cancellation callbacks.

An already serialized seed is copied data owned by its adopting scope and frame
leases, not a cross-process reference to a live foreign owner. Ready-state
transport, historical adoption, local `useSignal$`, and metadata-only inspection
remain supported. Local `useDerived$` and local async hooks remain deferred
because speculative closure staging is unresolved. Mutation journals, remote
write reconciliation, deep stores, pending producer transport, non-DOM hosts,
and cross-root atomic reveal remain outside this experiment.

## Validation environment

The local environment is macOS arm64, Node 26.4.0, and pnpm 11.15.1. The
configured registry denied the locked `@tsrx` npm payloads with HTTP 403,
including the approved retry outside the sandbox. Locked package versions were
not changed to make installation pass. The previously recorded frozen offline
lockfile check proves lockfile consistency, not a complete workspace install.

The new compiler evidence uses the public `tsrx-org/tsrx` tag
`@tsrx/core@0.1.61`, verified to commit
`7cb01278dff7aebfd25cbf5abcd2d47c6da7d81a`, plus this repository's existing
segments patch. The actual Octane compiler, Vite plugin, runtime, and authored
fixtures come from the experimental worktree. The harness enables frozen parser
AST and generated-location assertions. Dependency manifests and observed Node
module loads are hashed, and runtime/compiler/test inputs are snapshotted before
and after each audited run.

This is supplemental public tagged-source validation. It does not establish
npm tarball integrity, an SRI match, or a complete locked workspace. The
[source validation report](../benchmarks/scoped-signals/results/2026-08-27/consolidation-source-validation.json)
contains provenance, exact local harness hashes, its configuration and resolver
text with path placeholders, assertion names, and raw report hashes. Repeating
that supplemental setup elsewhere requires equivalent staging; ordinary
repository commands remain the intended acceptance gates.

The actual `pnpm sync` was attempted with
`pnpm_config_verify_deps_before_run=warn pnpm sync`, using pnpm's dependency
verification setting to avoid another automatic full install. Version
artifacts, Playwright fixtures, parity fingerprints, binding status/gaps, and
package inventory ran. CLI data generation stopped because
`@tsrx/prettier-plugin` was unavailable to its Prettier resolver. Generated
changes are included. Complete sync and canonical repository checks remain
unmet; the supplemental formatter is recorded separately.

## Current correctness evidence

The primary integration path is authored TSRX `@{}` components and their compiled templates. Ordinary returned-element syntax is secondary compatibility coverage. The final audited source run covers these assertions:

| Lane | Passed | Observation boundary |
| --- | ---: | --- |
| Data engine | 210 | Public state, async, streams, serialization, inspection, and operation models |
| Compiler and nominal diagnostics | 155 | Actual emitted code, inferred/explicit memo contracts, frozen ASTs, and diagnostics |
| Native development | 93 | Compiled fixtures, DOM, SSR, hydration, local lifetime, and Suspense |
| Native production | 93 | The same contracts under production compilation |
| Native strong mode | 93 | The same contracts under strong compilation |
| Ordinary opt-out controls | 2 | Native handle reads do not subscribe ordinary components |
| Real Chromium | 4 | Native and ordinary applications in development and production |

All 650 assertions passed in one final run after the ordinary-bundle reachability
fix. That command ran with approved execution outside the sandbox so Chromium
could launch. Its before/after source snapshots match the final working source.
The report separately records the earlier sandbox launch failure and its retry;
those are not substituted for this final run.

The native suites cover parameter defaults, imported helper and indirect-return
reads, first-render activation in plain modules, inferred memo reuse and branch
replacement, explicit dependency controls, shared owners, cancellation,
serialization, and historical adoption. They also preserve keyed host identity,
local-hook retirement, and accepted output when later work suspends. The real
browser cases verify focus, selection, input values, surviving host nodes, and
unmount/remount while the shared data owner remains live. Happy DOM supplies the
other DOM suites; those timings are not browser layout or paint measurements.

A separately scheduled descendant could bypass its visible Suspense
boundary's rollback window. The runtime now routes a transition through the
owning visible primary and uses the existing DOM journal and captured work.
A later suspension discards provisional reads, refs, and effects as well as DOM
patches. No second scheduler or graph was introduced. The final ordinary boundary audit
passes 140 of 141 cases in each development and production run, with unchanged
before/after source manifests. Its remaining nested-portal ref-detach failure
also reproduces in a focused run against the exact baseline. It is not recorded
as a green full boundary suite.

Secondary compatibility tests exposed an ordinary return-element defect inside
`.tsrx` files: eager client fragment lowering and raw server HTML broke stored
value inspection and rendering. That path now uses existing element descriptors,
with deferred normalization for compiler-only syntax. Stored styles enter the
current server request, including static and empty styled fragments, and
metadata stays in the head. Its 14 cases pass in each native mode. This does not
replace the compiled template path used by `@{}` TSRX components.

The [controlled-fault report](../benchmarks/scoped-signals/results/2026-08-27/consolidation-faults.json)
records meaningful negative controls. Nine new ownership regressions fail on
the unchanged baseline. Eight isolated engine faults are detected, including
lost retirement provenance, idle request reuse, partial retained calculations,
and conflating activity with availability. Five isolated compiler faults fail
relevant assertions when eager client folding, raw server output, factory-only
style registration, styled fragment arrays, or skipped template normalization
are restored. These runs modify isolated copies or loader input, not the
working source.

Strict TypeScript checking of the plain engine and its tests passes. The
[scoped typecheck report](../benchmarks/scoped-signals/results/2026-08-27/consolidation-typecheck.json)
records an actual `tsrx-tsc --noEmit` pass for the new native fixtures through a
consumer-selected wrapper that only forwards `nativeReads: true` to the real
Volar compiler. The tagged TypeScript plugin itself does not forward that
option, so this does not establish the canonical workspace typecheck. No
diagnostics are suppressed. A duplicate generated `Suspense` value import was
fixed in the owning Volar transform; both new regression cases fail on the
baseline and pass on the candidate. The nearby Volar/AST run passes 31 of 33
cases; two supplemental dependency/type-resolution failures remain explicit.

The current [publication smoke report](../benchmarks/scoped-signals/results/2026-08-27/consolidation-package-smoke.json)
passes per-file ESM and CommonJS public imports, native activation before
server parameter evaluation, SSR seed capture, local-hook retirement, and a
strict declaration consumer with type-error controls. It uses the real package
builders in a temporary package. It does not build the complete compiler/Volar
graph or produce a complete publishable tarball.

Earlier DevTools, wrapper configuration, direct-runtime ABI, and expanded model
reports remain useful historical evidence but are not reruns of the current
implementation. The current engine lane does rerun its 50 seeded operation
models with 100 actions each. The earlier 100,000-operation expanded run retains
its original source hashes and is not counted as current coverage.

## Performance and retention evidence

The [current performance report](../benchmarks/scoped-signals/results/2026-08-27/consolidation-performance.md)
starts with authored `.tsrx` compiled `@{}` components. The matched baseline and
candidate use two warmups and nine samples, with separate runtime bundles for
each enabled/disabled case. Output, surviving host identity, updates, teardown,
and five-dependency `use()` factory work pass their controls. Compilation and
bundling are outside the timings. These are synchronous Happy DOM and SSR
costs, not browser layout, paint, or hydration timing.

Most compiled TSRX comparisons overlap their reported uncertainty intervals.
The prop update reading one signal rises from 1.591 to 2.045 microseconds (+28.6%, about
0.454 microseconds), with narrowly separated intervals. The unread enabled prop
update is 1.351 versus 1.356 microseconds; its intervals overlap, as do the
mount, signal update, and SSR cases with one read and the cases with repeated
or distinct reads. This does not establish zero overhead. The report separately discloses
collector microcosts and the larger cost of ordinary return-element syntax as
secondary compatibility coverage.

The first bundle run found that runtime invocation hooks accidentally retained
native adapter factories in ordinary entries. Collection through an already active driver keeps
activation explicit. The strengthened
[boundary control](../benchmarks/scoped-signals/results/2026-08-27/consolidation-bundle-boundary-red.json)
fails on both earlier candidate metafiles and passes the baseline. Final
ordinary entries emit zero bytes from the concrete native adapters, collector,
inspection, and retry implementations, and still exclude the scoped engine and
Alien. Compared with the previous draft, the ordinary client entry grows by
130 gzip bytes (44,004 to 44,134); SSR grows by 94 (12,246 to 12,340).
These are named public-export bundles, not incremental application sizes.

Both matched graph runs pass five shapes at scales 100, 1,000, and 10,000 and
1,000 ownership cycles with zero, 100, and 1,000 unrelated owners. The initial
run using the default stack failed in the raw Alien comparator's 10,000-deep chain
teardown; its failure is preserved. Both complete comparisons use the same
explicit 8 MiB Node stack. At the largest scale, the scoped chain batch score
rises from 1.274 to 1.514 milliseconds (+18.8%) versus the previous draft.
The current scoped engine takes about 2.3–4.0 times raw Alien's broad batch
update score, 7.8–16.7 times its construction score, and 4.8–6.8 times its
disposal score. These use the harness's shared score from its last sample window; raw samples
and uncertainty remain in the reports. Measured cycle cost does not grow with
unrelated owners, but the ownership layer is materially more expensive.

The current diagnostic of retained foreign values observes zero retired owners or nodes
after 100 and 1,000 consumer lifetimes while a producer remains live. Retiring
the live control and producer leaves zero workload scopes and nodes. Removing
one backlink deletion in an isolated bundle retains 1,000 disposed consumers,
then 1,001 after retiring the control, until the producer retires. The scanner
handles WeakMap values only when their key and table are live. This is evidence
for that ownership workload, not async attempts, historical frames, DOM, or
DevTools. The normal heap bundle matches the measured engine bundle. All 30
separate routing, workload, bundle boundary, and scanner checks pass.

Published report JSON is formatted after capture without changing parsed
values. Exact original bytes remain local; hashes of raw logs and original inputs
keep that meaning, and source and bundle hashes remain unchanged.

The [earlier engine report](../benchmarks/scoped-signals/results/2026-08-27/README.md),
[async retention diagnostic](../benchmarks/scoped-signals/results/2026-08-27/async-retention.md),
and `*-final` JSON reports remain historical. A current claim must use the
matching consolidation report and its source hashes. Raw heap snapshots remain
local because they can contain process values. Retention diagnostics establish
only the measured workloads, not the absence of every leak.

## Unmet acceptance gates

- Complete locked workspace installation and successful canonical `pnpm sync`,
  formatting, typechecking, testing, and package builds.
- Remaining compiler/profile/DevTools and existing repository suites, beyond
  the explicitly recorded supplemental cases. Native option forwarding and
  configuration reload matrices for app Vite, Rspack, and Rsbuild are not a
  completed wrapper acceptance gate.
- Native option forwarding in the canonical `tsrx-tsc` integration, complete
  compiler/Volar package output, and an actual publishable tarball.
- Existing application benchmarks and larger native Todo/dashboard scaling and
  continuous lifetimes with DevTools off and on. The focused compiled cost
  fixture does not replace those workloads or measure browser paint.
- Historical-frame, native DOM, and DevTools heap diagnostics beyond the
  recorded engine ownership and cancellation-ignoring producer workloads.
- Successful required and relevant CI on the current pushed head. The PR
  remains draft as requested; skipped jobs cannot satisfy this gate.
