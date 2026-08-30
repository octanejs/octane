# ReactCompat Phase 0 decision record

Recommendation: keep the ReactCompat experiments private while evaluating a
maintained, version-pinned React DOM integration. The current candidate can hold a completed
commit from one React root. It cannot yet coordinate the commit phases of Octane
and multiple React islands, or report all escaped React suspension.

This experiment changes no production Octane runtime or published exports. On
2026-08-28, its focused suite passed **49 tests in 5 files** on Node 26.4.0,
macOS arm64, and Chromium: 26 authoring checks, 6 stock-root browser controls,
14 candidate browser checks, and 3 materializer checks. Authoring checks run
with both Octane compilation modes; browser checks build both React distributions.
Passing these controls does not complete the [Phase 0 gates](../../docs/octane-hosted-react-compat-plan.md#phase-0--prove-the-hard-contract-before-committing-to-an-adapter).

The [run summary](./evidence/summary.json) records versions, source hashes, and
validation limits; [stock observations](./evidence/stock-roots.json) and
[candidate observations](./evidence/candidate.json) retain the browser results.
The stock transition remained pending with its old content across a paint
opportunity before its resource resolved. That is an observed transition episode,
not a timing guarantee for every possible React workload.

Mutation controls were also checked and restored: removing the authoring marker
or child key breaks the corresponding transport tests; disabling the emitted
commit-admission guard prevents the initial-hold tests from obtaining a prepared
candidate in both React builds. The final passing run uses restored source.

## Intended API and current scope

The requested public surface remains:

```tsrx
import { ReactCompat } from 'octane/react';
import { Counter } from './Counter.js';

function App() @{
	<ReactCompat>
		<Counter start={3} />
	</ReactCompat>
}
```

That export is **not implemented or published**. The authoring fixture imports
its private [`stock-root-bridge.ts`](../../packages/octane/tests/react-compat-spike/stock-root-bridge.ts).
It uses existing `descriptorChildren` transport to snapshot one component's
type, props, key, and ref, then renders it through real React. Its tests cover
aliases/re-exports, component kinds, state survival, keys, refs, and input
snapshots. `React.act` makes those authoring tests deterministic; they are not
proof of synchronous Octane entry or commit coordination.

There is a recorded transport gap: an undefined prop on a function component
with legacy `defaultProps` receives the default through the current descriptor
path and `React.createElement`, while React 19.2.7's automatic JSX leaves it
undefined. Class defaults agree. The passing differential check records this
mismatch; it does not grant the transport full React JSX parity.

## What the executable controls establish

All browser fixtures use real React/React DOM **19.2.7**, public DOM/effect/ref
observations, and application resource or subscription signals. They do not use
`act`, private Fiber reads, render-count assertions, or guessed settling delays.
The candidate fixtures additionally use the patch's explicit token API.

| Evidence | Result | Limit |
| --- | --- | --- |
| [Stock-root probes](./stock-react-root-probes.tsx) | A fallback effect observes urgent suspension. A React-local transition retains old content and reports pending without ever committing that fallback. | A fallback observer cannot supply the required escaped-suspension or pending protocol. |
| Stock detached/hidden-root controls | Refs, layout/passive effects, subscriptions, and an external portal remain live. Actual root unmount cleans them up. | Detaching or hiding a host does not turn a React render into uncommitted work or implement Octane visibility. |
| [Commit-admission candidate](./candidate-probes.tsx) | Initial content, refs, effects, and portal output remain unpublished until acceptance. Internal button-driven state updates are held too. Superseded/aborted/disposed tokens reject late acceptance; a later update recovers after explicit abort; disposal cleans committed output and subscriptions. A root without a gate in the same patched renderer mounts and updates while gated work remains held. | This admits a completed commit for one root. Aborting a candidate does not erase React's queued state updates or cancel application promises. |
| Two-root candidate counterexample | After accepting the first root, its layout effect reads the second root's old content. Both roots eventually reach the new value. | Sequential acceptance is not a transaction with all participant mutations before new layout observations. |
| [Materializer checks](./patch/materialize.test.ts) | Unknown input hashes and unsafe output locations are rejected; output is reproducible and installed input bytes stay unchanged. | Artifact safety is separate from renderer semantic qualification. |

The [patch record](./patch/README.md) describes the exact source seams and
[provenance](./patch/provenance.json). Only the experiment's `react-dom/client`
is replaced with the generated client. React and ordinary React DOM imports
retain their real implementations and shared module identity. No installed
package is modified. Copying npm client artifacts is an experimental technique,
not a proposal to publish generated React code through Octane's authored-source
package surface.

## Remaining Phase 0 gates

| Gate | Still required before promotion |
| --- | --- |
| P0.1 Prepare/abort | An Octane sibling suspending after React preparation; head resources, permitted preloads versus forbidden publication, and abandoned mixed-tree work. The current hold covers DOM/ref/effect/portal publication only. |
| P0.2 Autonomous suspension and synchronous entry | Real escaped suspension/readiness signals, including internal transitions that produce no completed candidate; ready first-render timing and React/Octane `flushSync` composition. |
| P0.3 Transaction composition | Shared mutation and effect ordering across Octane and both React roots, overlapping transitions and urgent interruption, stale resolution, insertion effects, class snapshots/lifecycles, old cleanup, and store consistency. The sequential-accept counterexample remains a failing design strategy. |
| P0.4 Context | Accepted owner-scoped snapshots through memo, provider-only changes, explicit undefined, abandoned values, topology changes, and late discovery. |
| P0.5 Visibility | Outer Octane Suspense/Activity hide, hidden updates, reveal, deletion, focus, refs/effects, and external portal lifetime. |
| P0.6 Errors/reentrancy | Local versus escaped failures, fallback/cleanup errors, reentrant updates and deletion, nested OctaneCompat/ReactCompat, and nearest surviving recovery. |
| P0.7 SSR/hydration | Stable buffered sessions, adoption with preserved pre-hydration input, server error outcomes, cancellation/timeout, replay, and nested-session lifetime. The candidate rejects hydration roots. |
| P0.8 Version/build | Duplicate/mismatched React diagnostics, complete supported-toolchain qualification, native-only bundle controls, and upgrade/performance evidence. Exact artifact validation, ungated-root controls, and Chromium dev/prod checks are only part of this gate. |

## Next implementation decision

Continue with an explicit React DOM integration whose supported versions are
pinned and reviewed, rather than promoting the stock-root control as the full
adapter. The next slice should expose escaped root suspension separately from
completed candidates and design per-root commit state that can coordinate
mutation, ref, and effect phases with Octane. React currently has renderer-wide
pending commit-phase state; sequential calls to this patch's `accept()` cannot
supply that coordination.

Build the next proof around one Octane sibling and two React islands: hold a
transition, interrupt it urgently, resolve stale work, and verify what class
snapshots, old cleanups, refs, and new layout observers see. Include an external
store changing while work is held. Rechecking React's existing store flags is
not sufficient on paths that did not record those checks before subscriptions
connected.

This requires a maintained source-level renderer integration or an upstream
hook providing the equivalent contract. Keep the public export absent until
the required gates pass. Before shipping, assign a ReactCompat/React DOM
maintainer, define the source/artifact verification and upgrade procedure, and
qualify each supported dev/prod version explicitly. Whether that integration
stays small remains open; these controls do not establish that the full feature
is infeasible.

## Reproduce and validation limits

From the worktree root, with the lockfile's dependencies and a working Chromium
installation available:

```sh
node node_modules/vitest/vitest.mjs run \
	--config experiments/react-compat/vitest.config.js \
	--silent=passed-only
```

The browser runner builds and serves its own temporary fixtures. The candidate
runner materializes both pinned React DOM artifacts from the same installation
used by the fixture; no manual alias or generated-file setup is needed. Run
just the candidate browser checks with:

```sh
node node_modules/vitest/vitest.mjs run \
	experiments/react-compat/candidate-probes.test.ts \
	--config experiments/react-compat/vitest.config.js \
	--project react-compat-browser-probes \
	--silent=passed-only
```

Set `REACT_COMPAT_EVIDENCE_PATH` and
`REACT_COMPAT_CANDIDATE_EVIDENCE_PATH` to writable JSON paths to retain stock and
candidate observations, respectively. See [patch reproduction](./patch/README.md#reproduce)
for standalone materialization and its safety checks.

The focused test result is not a full repository or release qualification.
During this run, an approved dependency-install retry received registry HTTP
403 for `@tsrx/react@0.2.61`. Exact local copies of that package and
`@tsrx/core@0.1.61` were recovered; no alternative registry bypass was used.
Required `@tsrx/prettier-plugin@0.3.126` and
`@tsrx/typescript-plugin@0.3.126` remained unavailable at this checkpoint.
Standard repository formatting and the strict TSRX typecheck have not passed.
After recovering the lock-matching React declarations, a strict TypeScript check
of the browser probes/runners and materializer test passed (`skipLibCheck` skips
dependency declarations). This covers no `.tsrx` program and does not establish
the proposed public JSX types:

```sh
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
	--target esnext --module esnext --moduleResolution bundler --jsx react-jsx \
	--types node --allowSyntheticDefaultImports \
	experiments/react-compat/browser-probes.test.ts \
	experiments/react-compat/candidate-probes.test.ts \
	experiments/react-compat/patch/materialize.test.ts
```

The local check resolved React declarations from the exact cached versions;
the root workspace does not declare them. In a fresh installation, supply the
declaration resolution from `packages/octane` when running this standalone check.
The full CI-workflow test also stopped during root-config import at the missing
`@jridgewell/remapping` dependency. Browser probes are assigned to the existing
`heavy-browser` execution group, where Chromium is installed; their materializer
checks remain in the ordinary Node shards.

`pnpm_config_verify_deps_before_run=warn pnpm sync` ran its version, parity,
status, and package-inventory steps without tracked changes, then failed at
`cli:data` because the exact Prettier plugin was missing. The dependency-warning
setting did not make sync complete. Full sync, standard checks, broader native
and OctaneCompat regressions, performance/retention measurements, and current-head
CI remain required before a production handoff or release claim.

Markdown is excluded from the repository's normal Prettier pass. This record's
links, tables, and whitespace are reviewed directly; a skipped formatter is not
a passed document check.
