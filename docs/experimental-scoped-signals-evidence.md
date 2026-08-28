# Experimental scoped signals: implementation evidence

This remains an implementation experiment, not a
release or merge recommendation. The [API guide](experimental-scoped-signals.md)
describes the consolidated contract; the
[accepted plan](plans/2026-08-27-experimental-scoped-async-signals-plan.md)
records the broader acceptance gates. The author has marked
[PR 877](https://github.com/octanejs/octane/pull/877) ready so required CI can run.
No packages have been published.

The performance follow-up starts from
`422c2c937784af835c64d6fae5a39162143c7a44`, the consolidated draft, and also
compares with its predecessor `cd9ed33754bfc3eeb144ba256dc9b437614e3e92`.
Those reports use the `parity-` prefix and record their tested source hashes.
The `consolidation-` reports and older files named `*-final` retain their
original inputs. Their timings and expanded model runs are not silently
attributed to changed source. The primary checkout was not modified.

After the earlier consolidation measurements, upstream
`f036bad8d1e0e095694b8bbc71e95d13e01a7330` was incorporated. It changes only
the website homepage and its smoke test; that integration did not change the
measured runtime, compiler, dependency, or workload hashes. The performance
follow-up starts after that integration.

## CI repair verification

The first CI run after leaving draft exposed defects in nested Suspense ref
cleanup, caught deletion cleanup, and urgent state that superseded every held
transition update. The fixes preserve host identity, disconnect hidden refs
once, prevent abandoned replacement effects from connecting, and reveal the
latest state without showing a fallback. New public regressions failed before
the fixes; the original integration assertions remain intact.

The [CI repair report](../benchmarks/scoped-signals/results/2026-08-28/ci-repair.md)
records final-source checks and measurements, generated catalog and corpus
repairs, and the local locked-toolchain limitation. It supersedes the current
status claims in the earlier reports below. Historical measurements are not
retagged as measurements of the repaired runtime.

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

The performance follow-up avoids entering the same collection scope twice
when invocation collection already supplies the owner, observer, and write
guard. It also avoids preparing the block's candidate twice. Nested owners,
temporarily suppressed observers, detached memo witnesses, and empty successful
renders retain their existing boundaries. There is no new cache, candidate
pool, retained state, or graph change.

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

The local environment is macOS arm64 and pnpm 11.15.1. Individual reports record
their selected Node version: the focused error-bundle check uses Node 22.22.3;
the broader CI repair tests, timing runs, and generator helper use Node 26.4.0. The
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
contains the supplemental setup's provenance, exact local harness hashes, its configuration and resolver
text with path placeholders, assertion names, and raw report hashes. Repeating
that supplemental setup elsewhere requires equivalent staging; ordinary
repository commands remain the intended acceptance gates. The pre-CI
[correctness report](../benchmarks/scoped-signals/results/2026-08-27/parity-correctness.json)
records the follow-up's source snapshots, commands, results, and controlled
faults against that same setup.

The actual `pnpm sync` was attempted with
`pnpm_config_verify_deps_before_run=warn pnpm sync`, using pnpm's dependency
verification setting to avoid another automatic full install. Version
artifacts, Playwright fixtures, parity fingerprints, binding status/gaps, and
package inventory ran. CLI data generation stopped because
`@tsrx/prettier-plugin` was unavailable to its Prettier resolver. Generated
changes are included. During the CI repair, the remaining canonical generators
were also executed against identical source copies with the available
dependencies. They passed and generated the new CLI error explanations. This
does not turn the interrupted local command into a completed locked sync.

The [fresh workspace gate attempts](../benchmarks/scoped-signals/results/2026-08-27/parity-workspace-gates.json)
record the follow-up's failed sync and scoped formatting, typecheck, and Vitest
commands. Sync stops at the same missing formatter package; the scoped
commands cannot find the `prettier`, `tsrx-tsc`, and `vitest` executables.
This sync attempt produced no additional generated diff, and the audited
source hashes remained unchanged. These failures are not supplemental passes.

## Recorded pre-CI correctness evidence

The primary integration path is authored TSRX `@{}` components and their compiled templates. Ordinary returned-element syntax is secondary compatibility coverage. The final audited source run covers these assertions:

| Lane | Passed | Observation boundary |
| --- | ---: | --- |
| Data engine | 210 | Public state, async, streams, serialization, inspection, and operation models |
| Compiler and nominal diagnostics | 155 | Actual emitted code, inferred/explicit memo contracts, frozen ASTs, and diagnostics |
| Native development | 95 | Compiled fixtures, DOM, SSR, hydration, local lifetime, and Suspense |
| Native production | 95 | The same contracts under production compilation |
| Native strong mode | 95 | The same contracts under strong compilation |
| Ordinary opt-out controls | 2 | Native handle reads do not subscribe ordinary components |
| Real Chromium | 4 | Native and ordinary applications in development and production |

All 656 assertions passed in one final run after the collection optimization
and resolver correction. That command ran with approved execution outside the
sandbox so Chromium could launch. Its before/after snapshots match all 1,072
runtime, compiler, fixture, and test inputs in the audited set.

The new preservation cases keep sibling subscriptions independent across
repeated prop updates, retire disabled readers, restore collection after
derived reads, and leave lifecycle reads and writes untracked. Disabling child
retirement preparation fails the subscriber oracle in all three compile
modes. An earlier isolated observer fault, before the resolver correction,
leaves rendered output stale in all three modes. Separate untimed collector
controls detect removal of either the
observer or write-guard condition.

The first shortcut exposed a real contract mistake: the stored-value resolver
treated a negative cleanup token as proof that no rendering owner existed.
The full run caught 18 failures. The resolver now determines collection from
the rendering context and uses the token only for restoration. The rejected
version and its timings remain separately identified and support no claim
about the corrected source.

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
patches. No second scheduler or graph was introduced. The earlier consolidation boundary audit
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

The pre-CI correctness report also records a successful scoped
`tsrx-tsc --noEmit` run for the preservation fixtures and unchanged source
snapshots. It has the same tagged-toolchain limitations.

The pre-CI [publication smoke report](../benchmarks/scoped-signals/results/2026-08-27/parity-package-smoke.json)
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

## Recorded pre-CI performance and retention evidence

The [pre-CI performance report](../benchmarks/scoped-signals/results/2026-08-27/parity-performance.md)
starts with authored `.tsrx` compiled `@{}` components. The previous
[consolidation run](../benchmarks/scoped-signals/results/2026-08-27/consolidation-performance.md)
reported a one-signal prop update of 1.591 versus 2.045 microseconds (+28.6%).
A fresh unchanged-source run did not reliably reproduce that gap; its wide
variance precludes treating the old figure as a stable baseline.

The focused follow-up keeps each compiled root mounted and pairs baseline and
candidate blocks in seeded ABBA or BAAB order. Each of two independent runs
uses eight warmup blocks and 25 pairs of 10,000 prop updates per case. It
compares both previous draft revisions and preserves every sample. The
ordinary component is a byte-identical control in the comparisons with the
consolidated draft; its bundle differs from the pre-consolidation draft.
Output, surviving host
identity, signal writes, and teardown are checked outside timing. Compilation,
bundling, and prop allocation are also outside timing. Wall time is primary;
thread CPU, GC overlap, and host load are diagnostic, not corrections applied
to samples.

Against the pre-consolidation draft, the corrected source's one-signal prop
update ratios are 0.962 (95% interval 0.887–1.043) and 0.998 (0.963–1.035).
Against the consolidated draft, they are 0.997 (0.839–1.185) and 0.965
(0.916–1.016). These point estimates are close to parity, but neither a
reliable speedup nor exact zero overhead is established. In particular, the
follow-up does not prove that the optimization removed a reproducible 28.6%
regression. Repeated and distinct reads and the enabled no-read control remain
in the report, including unfavorable and noisy results.

The original full cost harness separately checks mount, signal updates, SSR,
and collector costs with two warmups and nine samples. Its timed loops are
unchanged; the new observer and guard controls execute in a separate untimed
bundle. Ordinary return-element syntax remains secondary compatibility
coverage. These synchronous Happy DOM and SSR measurements do not measure
browser layout, paint, or hydration timing. Its final one-signal prop-update
point ratio against the pre-consolidation draft is 1.187, with roughly 17% and 28%
relative margins of error for the two means. This unfavorable, noisy result
is retained alongside the focused comparisons; the different lifecycle and
measurement methods are not pooled into one result.

All seven selected public-entry bundles are byte-identical to the consolidated
draft. The compiled native client fixture bundles do grow: the one-, repeated-,
and distinct-read cases add 50 raw bytes and 25 gzip bytes each; the enabled
no-read case adds 74 raw bytes and 47 gzip bytes. The corresponding SSR bundles
add 29 raw and 16 gzip bytes per read case, and 53 raw and 28 gzip bytes for
the enabled no-read case. These are complete fixture bundles, not changes in
emitted compiler syntax or universal application costs.

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

The earlier matched consolidation graph runs pass five shapes at scales 100, 1,000, and 10,000 and
1,000 ownership cycles with zero, 100, and 1,000 unrelated owners. The initial
run using the default stack failed in the raw Alien comparator's 10,000-deep chain
teardown; its failure is preserved. Both complete comparisons use the same
explicit 8 MiB Node stack. At the largest scale, the scoped chain batch score
rises from 1.274 to 1.514 milliseconds (+18.8%) versus the previous draft.
That scoped engine takes about 2.3–4.0 times raw Alien's broad batch
update score, 7.8–16.7 times its construction score, and 4.8–6.8 times its
disposal score. These use the harness's shared score from its last sample window; raw samples
and uncertainty remain in the reports. Measured cycle cost does not grow with
unrelated owners, but the ownership layer is materially more expensive. The
performance follow-up leaves graph source unchanged and does not rerun or
claim improvements in those graph timings.

The final follow-up diagnostic of retained foreign values observes zero retired owners or nodes
after 100 and 1,000 consumer lifetimes while a producer remains live. Retiring
the live control and producer leaves zero workload scopes and nodes. Removing
one backlink deletion in an isolated bundle retains 1,000 disposed consumers,
then 1,001 after retiring the control, until the producer retires. The scanner
handles WeakMap values only when their key and table are live. This is evidence
for that ownership workload, not async attempts, historical frames, DOM, or
DevTools. The new normal heap bundle exactly matches the prior measured engine
bundle. The five checkpoints retain two, two, two, one, and zero intentionally
live workload scopes, respectively, with no retired cycle owners or nodes.
The earlier consolidation's 30 routing, workload, bundle boundary, and scanner
checks remain historical; the current bundle and retention runs are recorded
separately.

Published report JSON is formatted after capture without changing parsed
values. Exact original bytes remain local; hashes of raw logs and original inputs
keep that meaning, and source and bundle hashes remain unchanged.

The [earlier engine report](../benchmarks/scoped-signals/results/2026-08-27/README.md),
[async retention diagnostic](../benchmarks/scoped-signals/results/2026-08-27/async-retention.md),
and `*-final` JSON reports remain historical. A current claim must use the
matching report and its source hashes. Raw heap snapshots remain
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
- Successful required and relevant CI on the current pushed head. The live
  [PR checks](https://github.com/octanejs/octane/pull/877/checks) are authoritative;
  skipped jobs cannot satisfy this gate.
