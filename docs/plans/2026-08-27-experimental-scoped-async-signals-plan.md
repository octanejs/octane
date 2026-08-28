---
title: Experimental scoped async signals
type: experiment
date: 2026-08-27
status: experimental-implementation
branch: codex/experimental-scoped-async-signals
base: c84edbb271c19488922f3d9941e374f022ead516
---

# Experimental scoped async signals

Build an opt-in implementation of [RFC 2](https://github.com/octanejs/RFCs/discussions/2) over Alien Signals, then measure whether its ownership, async coordination, and native Octane integration remain correct and economical as graph size, consumer count, and application lifetime grow.

The plan was accepted for implementation on 2026-08-27. Work is isolated in the worktree below and is published in [PR 877](https://github.com/octanejs/octane/pull/877), initially as a draft. The author has since marked it ready to enable CI. The API remains experimental; source changes and supplemental checks do not establish that every compiler, browser, package, or performance gate has passed.

The first prototype incorporated upstream `69a56855c21b71f824bdf1064d03e86b0a203eb9`, which added unrelated Inferno benchmark targets. The consolidation later incorporated `f036bad8d1e0e095694b8bbc71e95d13e01a7330`, which changes only the website homepage and its smoke test. Neither integration changes the measured runtime/compiler sources; reports preserve their original inputs.

## Contract consolidation, 2026-08-27

This consolidation starts from `cd9ed33754bfc3eeb144ba256dc9b437614e3e92`. These decisions refine the original plan; the current [evidence report](../experimental-scoped-signals-evidence.md) distinguishes implemented behavior from validation gates that remain unmet.

- Preserve branded `$` handles, explicit data owners, canonical copied request arguments, and sharing only while a resource selects a request. No idle request cache is added.
- `isPending(read)` asks whether the authored synchronous expression can return a usable value. A strict pending read returns true; a successful `latest(fallback)` or fallback projection returns false. Errors still propagate. Background refresh and stream activity belong to snapshots.
- `latest` retains one complete successful result. Identity, content, and commands that must agree belong in the same derived record. Retirement of any contributing owner revokes that retained result, even when the current branch no longer depends on that owner.
- Serialized seeds are copied data owned by the adopting scope and its frame leases. They do not transport live foreign-owner identities; an already copied seed is not retroactively revoked when its original producer retires.
- Activate native collection before runtime component invocation, covering parameter/default evaluation and functions whose returned value is not syntactically direct JSX. Existing component cleanup, block scheduling, committed subscriptions, rollback, and read witnesses remain authoritative.
- Activation is a capability of the shared DOM runtime instance. An opted-in rendered module activates it; memo-bearing application modules must be compiled consistently with `nativeReads: true`. Engine-only data modules must not acquire a renderer import. Unused/default builds keep the inactive driver path.
- In opted-in modules, an omitted `useMemo` dependency argument retains ordinary lexical inference and additionally validates and replays native reads observed in the memo. Explicit dependency arrays and `null` retain their existing contracts. Known live reads inside fixed-dependency callbacks remain diagnosed; effects and event callbacks remain imperative.
- Keep local `useSignal$`, naming diagnostics, DevTools, and automatic ready-state SSR manifests. Mutation confirmation, local derived/async hooks, pending producer transport, and a general application persistence policy remain excluded.

Regression evidence must cover parameter plus body reads, indirect returns, nested scopes, failed and suspended attempts, memo reuse and dependency switching, SSR replay and hydration, foreign-owner retirement, late restoration after an edit, and stream replacement. New tests must fail on the prior behavior or a representative broken guard. The compiler cases run in development, production, Strong, and server modes when the locked toolchain is available; manual ABI probes remain explicitly supplemental.

The affected hot paths are component invocation, memo hits/misses, and retained cross-owner computations. Record matched baseline/candidate timing and bundle inputs, including an enabled component that reads no signals, and rerun retention after the final source changes. Missing compiler/browser dependencies remain an unmet gate, never an inferred pass.

Primary acceptance and cost reporting focus on compiled `@{}` TSRX components; ordinary return-element syntax remains secondary compatibility coverage. The consolidation's supplemental public tagged-source compiler evidence passed 650 assertions, including engine, compiler/diagnostic, native development/production/strong, ordinary opt-out, and real Chromium coverage. Its earlier sandbox launch failure is recorded separately. This is not the locked npm toolchain, a full workspace check, or current-head CI. Source and dependency hashes, controlled faults, costs, and the remaining boundaries are recorded separately rather than inferred from these counts.

## TSRX performance follow-up, 2026-08-27

The requested performance work starts from consolidated draft `422c2c937784af835c64d6fae5a39162143c7a44`. The target is compiled TSRX prop updates, especially the one-signal case previously measured at +28.6% against `cd9ed33754bfc3eeb144ba256dc9b437614e3e92`. Fresh unchanged-source measurements did not reliably reproduce that gap, so the original point estimate is not treated as a stable threshold.

Preserve the complete invocation contract while skipping duplicate collection setup only when the current owner, observer, and write guard already match and collection is not a detached witness. A block's candidate needs preparation once per invocation; lightweight child scopes still need independent empty-read retirement. Do not add graph caches or pool read candidates without separate evidence.

The first optimization exposed a resolver assumption that a negative cleanup token meant an imperative read. The broad suite caught 18 failures. The corrected resolver uses rendering context to decide whether to collect and replay witnesses; the token controls restoration only. Final supplemental validation passes 656 assertions: 210 engine, 155 compiler/diagnostic, 95 in each of native development/production/strong, two ordinary opt-out, and four real Chromium. New child-retirement and observer faults exercise consumer-visible failure, and scoped `tsrx-tsc --noEmit` passes with the existing tagged-toolchain limitations.

The focused benchmark keeps compiled roots mounted, alternates baseline/candidate blocks, and preserves all samples from two independent runs against each prior draft. The final one-signal prop-update point ratios against the pre-consolidation draft are 0.962 and 0.998; against the consolidated draft they are 0.997 and 0.965. All corresponding 95% intervals include parity. This supports near-parity point estimates, not a proven speedup, exact zero overhead, or removal of a reproducible 28.6% regression. Rejected intermediate timings remain labeled as such. The original mount/update/SSR/collector harness, public-entry bundles, and foreign-owner retention remain separate checks; none of these replaces the larger application, locked-workspace, or CI gates below.

Current commands, source hashes, results, and limitations are linked from the [evidence report](../experimental-scoped-signals-evidence.md). The author subsequently marked the PR ready to enable required CI; its follow-up report separates repairs and final-source measurements from this earlier evidence.

## Baseline and authority

| Item                       | Recorded state                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worktree                   | `/Users/domgan/.codex/worktrees/octane-scoped-async-signals-experiment`                                                                                                                                                           |
| Branch                     | `codex/experimental-scoped-async-signals`                                                                                                                                                                                         |
| Initial planning base      | Upstream `octanejs/octane` main at `c84edbb271c19488922f3d9941e374f022ead516`                                                                                                                                                     |
| Why upstream               | The fork's main was still `cc6e5ea2273c418f96519d1b51cf61749cd97875`; it was not a suitable current baseline.                                                                                                                     |
| RFC observed               | Updated 2026-08-27 10:56:18 UTC; [the user's design reply](https://github.com/octanejs/RFCs/discussions/2#discussioncomment-18174418) is part of the requirements.                                                                |
| Initial lockfile SHA-256   | `0b2fcc89ecac2590ccd05b32609900418f03cf60bc31b113fb1072b0b9157826`                                                                                                                                                                |
| Runtime/toolchain          | Repository requires Node >=22.22.2 and pnpm 11.15.1; local Node observed as 22.22.3. Benchmark CI uses Node 24. Record the actual selected environment for each run.                                                              |
| Implementation base        | Fast-forwarded to upstream `ba9abbfb634786a1b081852f6eb51845f3d588fc` before implementation; the primary checkout remains unchanged.                                                                                              |
| Final upstream integration | Merged `97b42683ff64e561638fcc7580ba324e76458244` before final validation; original measurement provenance is preserved.                                                                                                          |
| Experiment status          | Draft prototype with supplemental compiler, runtime, browser, and ownership evidence. Locked workspace checks and broader application comparisons remain unmet; see the [evidence report](../experimental-scoped-signals-evidence.md). |

Live user instructions outrank this plan. Current source and observable tests outrank summaries. Recheck the RFC and upstream base before implementation; retain the exact baseline revision and inputs used for measurements.

## Questions the experiment must answer

1. Can an Alien Signals graph use Octane's existing scope/block ownership, scheduling, and commit machinery without another owner tree or DOM scheduler?
2. Can native reads remain correct through automatic memoization, Strong mode, keyed reuse, suspended work, and historical hydration without changing existing hook contracts?
3. Do update and disposal costs follow the affected graph, rather than the total application or accumulated history?
4. Are retained values, request attempts, and hydration frames released when their documented owners and pins end?
5. What does the integration cost compared with the same Alien Signals version alone, existing Octane hooks, and the existing external-store binding?
6. Can developers explain a node's dependencies, invalidation, pending state, and retention without the inspector changing behavior or retaining the graph?

A negative performance result is a valid experimental result. Do not weaken semantics, alter controls, or claim a speed advantage to make the prototype look successful.

## Scope and decisions

The experiment includes:

- A separately importable `octane/signals` engine, using Alien Signals for dependency links, invalidation, and dirty checks.
- Explicit data scopes; writable signals; synchronous pure derived values; immediate reads after writes; batches/actions.
- Owned async request descriptions and loaders, attempts, retries, readiness/error propagation, quiet refresh, streams, snapshots, and `latest`.
- Opt-in DOM client/server integration through `nativeReads: true`, with matching compiler/runtime support.
- Native consumption owned by existing component scopes and blocks, including lightweight scopes and template scopes.
- Local synchronous signal/derived hooks after their stable-slot and speculative-closure contract is proven.
- Ready-state SSR seeds, boundary-local historical adoption, early-input/storage races, and release of adoption frames.
- Enforced `$` naming for the new API, development introspection, and production reachability checks.
- A representative Todo/dashboard fixture, a comprehensive behavioral test matrix, and measured scale/retention experiments.

Keep these decisions from the discussion:

- Keep the name `latest`; it retains a complete successful computation, which need not have committed.
- Preserve immediate read visibility. An action groups notifications, does not span `await`, does not roll back earlier writes on throw, and is not `untrack`.
- Track synchronous request descriptions; loaders are wholly untracked, including their synchronous prefix.
- Preserve explicit hook dependency arrays, inferred dependency behavior, native events, keyed identity, and existing Suspense/Activity semantics.
- Separate shared producer ownership from component consumer ownership.
- Keep mutation journals and authoritative remote-write reconciliation out of the initial implementation.

Other explicit exclusions: deep property stores; async `derived` callbacks; pending producer transport across server/client; coordinated reveal across independent roots; non-DOM/universal/native hosts; cross-realm handoff; a general persistence/conflict policy; and a replacement renderer, scheduler, or signal algorithm. Local async hooks are deferred: starting a request only after commit would deadlock an initial render that suspends on that request.

Local hook decision, 2026-08-27: this implementation includes `useSignal$` and defers `useDerived$` under the speculative-closure proof gate above. A stable facade over an attempt-owned derived node does not make a cached shared derived, or a memoized child holding its witness, see a newly staged prop closure. Invalidating or replacing the live node during staging would expose speculative state to committed readers. A complete solution needs graph evaluation that respects the rendering attempt, including transitive caches and escaped handles; that is not an adapter-only change. Keep `scope.derived$` as the supported synchronous derived API and do not register or export a partial local derived hook.

Do not publish packages or merge as part of this experiment. The PR began in draft as requested and stays ready after the author enabled CI. This experiment does not change the existing `@octanejs/alien-signals` binding or rename existing Octane APIs.

## Proposed architecture

### Alien Signals dependency

Use exact `alien-signals@3.2.0` as the initial candidate, subject to the adapter proof below. Its source is pinned at [077e9cb156fddd2736c23940efb887612fce6196](https://github.com/stackblitz/alien-signals/tree/077e9cb156fddd2736c23940efb887612fce6196). The published package exposes `alien-signals/system` with `createReactiveSystem({ update, notify, unwatched })` and link/unlink/propagation operations.

Add a dedicated catalog entry or exact dependency for the experiment. Leave the default catalog and the existing binding on 1.0.4: that binding's parity contract explicitly pins 1.0.4. A comparison across those versions is an integration comparison, not a measurement of wrapper overhead.

Prefer a narrow adapter over the public system API so Octane controls ownership and UI scheduling. Do not copy the graph algorithm or depend on private source imports. The [3.2.0 release notes](https://github.com/stackblitz/alien-signals/releases/tag/v3.2.0) require correct execution-depth/inner-write handling for custom API implementations; the adapter proof must exercise this and exception-safe tracking restoration.

### Layer boundaries

| Layer                 | Responsibility                                                                                                       | Constraint                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Alien Signals adapter | Links, tracking context, invalidation, dirty checks, unlinking                                                       | Use the pinned public API; no alternate graph implementation.                                  |
| State engine          | Branded handles, scope lifetime, values/status, request identities/attempts, retention records, serialization        | No client/server renderer imports.                                                             |
| Native adapter        | Render read records, scheduling owner, committed/provisional consumers, acceptance validation, cleanup, frame leases | Reuse existing runtime ownership and queues.                                                   |
| Compiler              | Optional native-read support, memo witnesses, hook slots, source diagnostics and metadata                            | Default output remains unchanged; no TypeScript project in the ordinary browser-safe compiler. |
| DevTools              | Read-only graph/owner inspection, causes, bounded traces                                                             | Use the existing bridge; no graph-retaining global registry.                                   |

Tentative source layout: `packages/octane/src/signals/` for the engine and adapter contract, with an optional client integration entry such as `octane/signals/client`. Keep component hook imports separate from the renderer-free engine. Final entrypoint spelling is a P0 decision; importing the engine must never import the DOM runtime.

The native protocol needs separate identities for the owning data scope, cleanup scope, schedulable block, render attempt, and historical frame. A stable handle is not evidence that the value or availability it exposes is unchanged.

### Public contract to freeze in P0

The following are recommended experiment defaults, not existing APIs:

| Topic             | Proposed contract                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naming            | `signal$`, `derived$`, `asyncSignal$`; `count$`/resource bindings and functions exposing native signals or hiding live reads use `$`. Plain sampled values do not.                                                                                                                    |
| Naming exceptions | `createScope`, `query`, `scope.get`, `set`, `latest`, and `snapshot` are explicit primitives. Durable scope/resource/query keys are separate from authored names. Commands are not suffixed merely because they write state.                                                          |
| Naming coverage   | Native branded types, aliases, destructuring, parameters, fields, exports/re-exports, and known accessors. Do not rename old binding APIs or treat arbitrary data/map keys as identifiers.                                                                                            |
| Equality          | Use `Object.is` for ordinary value equality initially. Treat object values used in history as immutable snapshots; in-place deep mutation is not reactive. Pin the exact input/serialization validation rules.                                                                        |
| Request identity  | Scope instance + stable query definition key + canonical arguments. Same textual `scopeKey` does not share memory. Detect incompatible query definitions under the same key.                                                                                                          |
| Argument keys     | Start with an explicit, validated serializable argument grammar and canonical object-key ordering. Reject unsupported/cyclic/ambiguous values rather than silently collide. Freeze treatment of undefined, non-finite numbers, -0, and mutation of arguments before coding key reuse. |
| Deduplication     | Scope-local in-flight sharing by request identity. Specify whether retries affect all selectors of that entry and how `pending: true` applies before implementing shared retry. Never deduplicate across owners implicitly.                                                           |
| Cache retention   | No unbounded history of selected keys. Begin with no idle completed-request cache beyond live resource ownership and explicit retention/frame pins; release entries once those leases end. A view disappearing does not retire a resource still owned by an explicit data scope.      |
| Availability      | Distinguish absent/pending, usable, refresh activity, error, connection state, and completion. Undefined/null/empty values are not pending sentinels.                                                                                                                                 |
| Retention         | `latest` keeps one complete successful computation per live node, plus explicitly pinned presented/adoption versions. Define its error behavior and reject retired owners/incompatible frames. Do not build a second general state branch system.                                     |
| Recovery          | Source retry and error-boundary reset remain distinct. Do not add automatic healing by accident.                                                                                                                                                                                      |
| Effects/memos     | Sample signals during render, then feed ordinary values to existing hooks. Automatic compiler memo witnesses are separate from explicit `useMemo`/effect dependency contracts.                                                                                                        |
| Local hooks       | Initial local hooks are synchronous and use existing call-site slots. Freeze their owner/read argument shape and captured-prop update behavior before implementation. No implicit ownership transfer when a handle escapes.                                                           |
| Disposal          | Revoke publishing rights, cancel/close work, release both directions of dependency links and retention records, and remove queued references. Surviving handles cannot resurrect a retired owner.                                                                                     |

Known live reads hidden inside ordinary memo callbacks need diagnostics. Both `useMemo(() => scope.get(count$), [count$])` and omitted dependencies can miss a value change under current lexical inference. Decide the diagnostic severity and explicit intentional-snapshot escape in P0. Do not silently add dependencies to an explicit array.

Source analysis can follow known bindings and same-module helpers; an optional typed validator can cover imported branded handles and fields. Opaque imported functions returning a plain number cannot always be statically classified. Runtime tracking must remain correct despite that limit or a missing suffix.

## Source seams and risks already identified

| Existing seam                                                                           | Implication for implementation                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime.ts`: `Scope`, `registerHookCleanup`, `unmountBlock`/`unmountScope`             | Attach real cleanup to the existing lazy ownership structures. Preserve effect phase and HMR behavior.                                                                                                                                               |
| `batchClearItems`                                                                       | Fast clear skips full teardown when cleanup/child/slot lists are empty. A consumer kept only in a side table would miss disposal. Cover bulk clear as well as individual removal.                                                                    |
| `componentSlotLite` / `LiteBlockImpl`                                                   | Cleanup ownership and scheduling ownership differ. The lite proxy is not a schedulable block; schedule the actual ancestor or deliberately exclude signal readers from this lowering. Measure that choice.                                           |
| `RootRenderTransaction`, `commitRootRenders`                                            | Validate native reads before irreversible deletion and ref/effect publication. Retain old committed subscriptions until replacement is accepted.                                                                                                     |
| `OffscreenCapture.renderCleanups`, `scheduleRenderCleanup`, splice/discard/WIP disposal | Reuse existing commit/discard boundaries for provisional leases. Nested completion remains provisional under a held ancestor.                                                                                                                        |
| `useSyncExternalStore` / `drainStoreSyncs`                                              | Existing synchronization runs after layout and intentionally skips some unchanged-snapshot checks. It is a comparison control, not proof of the stronger native protocol.                                                                            |
| `deactivateScope`                                                                       | Activity still renders hidden state/DOM, disconnects layout/passive effects, and keeps insertion effects. Suspense hide disconnects layout but preserves already-connected passive effects. Do not blanket-pause or dispose hidden signal consumers. |
| `runtime.server.ts`: `normalizeThrownServerThenable`                                    | Raw resource suspension already retries, but does not create a `use()` occurrence or hydration seed. Native seeding is separate work.                                                                                                                |
| `SSRScope`, `ResolvedMap`, `runFullFramedPass`                                          | Canonical server passes recreate scopes. Keep producers at request lifetime without importing a client block graph or creating global caches.                                                                                                        |
| Boundary hydration seed installation/restoration                                        | Read historical values without populating live or foreign caches. Historical read tokens validate a frame lease, not equality with the latest live version.                                                                                          |
| `emitAutoMemoRegion`, declaration/whole-component caches, keyed reuse                   | Preserve read/version witnesses through cache hits, including transitive imported readers. Do not globally disable useful memoization.                                                                                                               |
| `hook-deps.js`, `hook-names.js`, `slot-hooks.js`                                        | Register actual new hooks by provenance, preserve explicit arrays and custom-hook slots, and keep plain-loop diagnostics. A suffix does not create hook semantics.                                                                                   |
| `compiler/typescript.js`, Volar                                                         | Keep typed naming facts optional and separate; preserve exact-source identity, browser compilation, source maps, and copy-on-write ASTs.                                                                                                             |
| `devtools-hook.ts` and `packages/devtools/src/bridge.ts`                                | Extend the existing versioned protocol with graph and ownership views; do not add a second permanent root registry.                                                                                                                                  |

## Implementation sequence

Each unit has its own behavioral tests. Add a test before implementing its contract, observe the relevant failure, and later verify representative guards by temporarily breaking them and restoring the implementation. Do not carry deliberately broken code or skipped tests forward.

### P0. Freeze the small contract, establish controls, prove the adapter

- Install pinned dependencies only in the experimental worktree. Record the actual toolchain, lockfiles, browser version, build flags, fixture revisions, and commands.
- Freeze the open API decisions above, especially local hook ownership, manual memo reads, argument keys/dedup/retry, retention/error behavior, and ready/error SSR adoption.
- Capture baseline conformance and representative benchmark controls before changing runtime/compiler production source.
- Verify the 3.2.0 published exports/integrity and build a small adapter proof for dynamic dependencies, diamonds, batching, exceptions, pending/error retry, unobserved computations, and explicit unlink/disposal.
- Test tracking restoration after throw, nested execution, and forbidden writes; distinguish graph `unwatched` from owner retirement.
- Define the optional introspection record/trace schema and accounting needed for memory diagnosis now.
- Exit: a documented adapter contract using the public Alien API, reproducible controls, and no unresolved correctness requirement hidden behind a name.

Stop and revise if the required behavior needs a copied graph core, a second DOM scheduler, or an ownership scheme incompatible with Octane's teardown paths.

### P1. Implement the minimum synchronous engine and native vertical slice

- Register the dedicated enabled test projects described below before relying on native-render test results; retain existing disabled-feature projects as controls.
- Add renderer-free scopes, writable/derived handles, public reads/writes, batches, retirement, and the minimum native read/subscribe/validate capability.
- Implement attempt-local read collection, committed/provisional consumers, acceptance checks, and cleanup through existing scopes and transaction/WIP boundaries.
- Start with direct/imported reads through two shared consumers, an automatic memo, a keyed list, a held render, and clear-all.
- Prove that a missed suffix cannot turn a live read into a permanently cached value.
- Prove a discarded attempt loses its leases without disconnecting the committed view.
- Exit: native correctness and disposal work in both runtime compile modes, and disabled native reads preserve existing controls. Do not broaden the API before this proof.

### P2. Complete owned async state and retained computations

- Add synchronous request descriptions, wholly untracked loaders, request selection/attempt generations, scope-local deduplication, retries, quiet refresh, status snapshots, `isPending`, and `latest`.
- Add streams with independent readiness/activity/connection state and explicit iterator cleanup.
- Implement bounded request-record retention under the P0 lease policy. Cancellation is advisory; publication guards are mandatory.
- Cover A→B→A selection, same-key retry, old success/rejection, shared consumers, owner retirement, never-settling producers, and valid empty/undefined results.
- Exit: engine-only model tests pass without DOM globals, and async ownership does not depend on whether a presentation happens to be mounted.

### P3. Finish compiler/API integration and local synchronous ownership

- Thread validated `nativeReads` through compile types, bundler cache identity, Vite/app config, Rspack/Rsbuild, and split hydration/server compilation.
- Complete witness capture/replay for automatic declaration/region/component caches, Strong mode, helper calls, template scopes, keyed rows, and supported JSX paths.
- Implement naming diagnostics and editor agreement, plus the separate typed coverage required for aliases/fields/imports.
- Add the chosen synchronous local hooks with stable call-site slots and closure/prop updates staged under the existing render attempt.
- Preserve ordinary state/getter semantics and explicit/inferred/null dependency rules. Do not mirror state through effects.
- Exit: public types, diagnostic locations, imported/custom-hook cases, AST immutability, editor mappings, and browser compiler import boundaries pass.

### P4. Integrate async rendering, Suspense, Activity, and recovery

- Connect strict pending/error reads to the existing root and boundary retry paths.
- Validate native read records at every acceptance path before irreversible work; keep committed subscriptions and displayed event identity coherent while replacements are held.
- Define one acceptance point before irreversible commit work. Before acceptance, incompatible live writes invalidate the candidate. After acceptance, writes from deletion cleanups, refs, or layout callbacks belong to a subsequent transaction; they do not retroactively undo an accepted snapshot. Captured callbacks observe their accepted render values, while explicit imperative reads still see current live values. Preserve existing commit ordering and flushSync reentrancy semantics. Root unmount or supersession must invalidate remaining publication from the obsolete owner/generation. Prove this with cleanup/ref/layout writes, reentrant flushSync, and root replacement before calling the protocol complete.
- Distinguish live records from deliberately retained/presented records.
- Preserve existing effect phase behavior across urgent updates, transitions, nested boundaries, Activity, supersession, teardown, and HMR.
- Keep source retry separate from boundary reset. Add no speculative effects or render-phase writes.
- Exit: zero mixed visible states in the signal dashboard and all ownership/retention scenarios pass through real browser observation where needed.

### P5. Add ready-state SSR and historical adoption

- Add request-owned native state to server retry/pass isolation; serialize only the defined ready-state contract.
- Define seed schema/version, scope/query/argument identity, validation, and serialization limits.
- Add root/boundary read frames with explicit leases. Evaluate historical projections without mutating the live graph's caches, retained result, or other scopes.
- Pin the required historical records until adoption/replacement/disposal releases them; never retain an unbounded render history.
- Preserve existing parallel `use()` discovery/order, seed identities, rollback, and recovery behavior.
- Add early input and storage restore fixtures, including intentionally empty edits and an edit during handoff.
- Explicitly test the chosen behavior for pending/rejected server resources and catch DOM; do not imply unfinished producers or arbitrary error objects are transported.
- Exit: independent islands adopt their own HTML without rewinding live neighbors, creating duplicate owned requests, or retaining released frames.

### P6. Expose development introspection and verify package boundaries

- Extend the current DevTools bridge with names/source locations, owner and consumer links, invalidation causes, attempts, availability/activity, and retention reasons.
- Provide a bounded action→write→invalidate→schedule→commit/discard trace.
- Inspection must not invoke getters/computations, start work, attach dependencies, or keep disposed owners alive. Use bounded value previews and avoid recording large/private values by default.
- Add source and published entrypoints/build/type coverage, with a matching native compiler/runtime capability version.
- Prove engine-only/client/server imports remain separated and normal production applications do not reach Alien, async, or DevTools code.
- Exit: read-only inspection and its cleanup work, and production reachability controls remain intact.

### P7. Run the full scalability/retention investigation and report

- Extend the existing benchmarks with native-signal targets while retaining current hooks and old-binding controls.
- Add continuous memory and graph/ownership scaling suites where the existing harness cannot answer the question.
- Run timing, deterministic work accounting, and heap/retainer diagnostics separately.
- Re-run relevant existing suites after the final changes; preserve their semantic and ratio gates.
- Produce an evidence report with environment/commands, results/variance, costs, limits, and a recommendation to proceed, revise, or stop.
- Finish with an adversarial review of allocation paths, abandoned work, frame release, unsupported modes, and optional-feature reachability.

## Correctness and test matrix

Use public values, snapshots, DOM, identities, effects, refs, native events, diagnostics, and documented notifications as oracles. Keep internal node/edge counts and exact codegen/byte claims in benchmark diagnostics, not ordinary correctness tests.

| Family                 | Required cases                                                                                                                                                                                                                                                | Harness/location                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| State and graph        | Immediate reads; updater/function values; equality; diamonds; dynamic dependency replacement; conditional reads; lazy/unobserved then reread; cycle policy; no writes in pure computation                                                                     | New `signals-state.test.ts`; engine-only Node lane         |
| Batching               | Nested action/batch; grouped notifications; throw retains prior writes; no accidental after-await batch; reentrant subscriber behavior; unsubscribe during notification                                                                                       | State engine tests                                         |
| Identity and attempts  | Same/different arguments; canonical object keys; unsupported keys; scope isolation; dedup/retry policy; A→B→A; old resolve/reject; same-key generations                                                                                                       | `signals-async.test.ts`                                    |
| Availability/retention | Initial pending; quiet refresh; pending retry; source errors/recovery; `isPending` does not swallow errors; valid null/undefined/empty; whole `latest` projection; computed but never committed; retired/incompatible frame                                   | Async + rendering fixtures                                 |
| Streams                | Initial/subsequent yield; readiness versus connection; normal completion versus protocol success; failure after value; supersession; late yield; return/cancel cleanup                                                                                        | `signals-streams.test.ts`                                  |
| Native memo reads      | Stable handles through direct/imported/aliased helpers, automatic memo regions, declarations, `memo`, Strong mode, keyed survivors, scoped child bodies, retries                                                                                              | `signals-rendering.test.ts`; existing memo suites          |
| Hook composition       | Samples consumed by inferred hooks; explicit []/[handle] stay authoritative; null unchanged; diagnostic escape policy; effect phase and committed snapshot                                                                                                    | Runtime fixtures + compiler diagnostic tests               |
| Local owners           | Stable slots; repeated custom-hook calls; ordinary conditional-hook absence versus removed template scope; keyed movement/removal; captured props; HMR; escaped disposed handle                                                                               | `signals-ownership.test.ts`                                |
| Shared owners          | Two roots/consumers; remove either/both; explicit data owner persists; nested/reentrant teardown; clear-all fast path; portal consumers; lite scopes                                                                                                          | Ownership + browser fixtures                               |
| Render attempts        | Held A still targets A; B/C supersession; obsolete attempts; dependency changes during hold; nested captures; subscription setup race; source changes before acceptance; cleanup/ref/layout writes after acceptance; reentrant flushSync and root replacement | Rendering + held-transition suites                         |
| Hidden lifetimes       | Activity hidden updates; insertion/layout/passive distinctions; Suspense already-connected passive effects; repeated hide/reveal; hidden suspension                                                                                                           | Existing Activity/Suspense suites with native variants     |
| SSR                    | Separate requests with equal keys; concurrent passes; no permanent speculative effects; raw resource retry; ready-only schema; unsupported/error seed behavior                                                                                                | `signals-ssr.test.ts`; shared server fixture               |
| Hydration              | Per-boundary historical frame; live revision ahead; no foreign/live-cache writes; multiple scopes; seed mismatch; early edit/empty edit; adopt/fail/unmount release; no duplicate loader                                                                      | `hydration/signals-hydrate.test.ts`; real browser fixtures |
| Browser continuity     | Adopted node identity; focus/caret/selection; native input/change; visible outside siblings; retained callback identity; edit while loading/installing subscription                                                                                           | `tests/browser/`; production and development fixtures      |
| Diagnostics/types      | Writable/read-only/resource inference; async derived rejected; suffix aliases/fields/exports; shadowed/unrelated APIs; source ranges; typed facts invalidate with source; no ambient *.tsrx escape                                                            | `tests/compiler/`, Volar tests, `typetests/`, `tsrx-tsc`   |
| Introspection/imports  | No evaluation on inspection; bounded trace; unsubscribe/dispose; labels/owners/attempts/pins; devtools does not retain; ESM/CJS/type exports; engine/client/server/browser compiler reachability                                                              | Existing DevTools/profile, package, and bundle suites      |

Mounting tests stay at the top level, with explicit project routing. Existing `octane`, `octane-prod`, and `octane-profile` projects do not enable native reads and must remain disabled-feature controls. Register these proposed projects in `vitest.config.js` and add their opt-in fixtures to the appropriate include/exclude lists:

- `octane-signals-node`: engine-only state/async/stream/model tests under Node, without DOM globals.
- `octane-signals`: native runtime/ownership fixtures with `nativeReads: true` in development compilation.
- `octane-signals-prod`: the same native fixtures with `nativeReads: true` and `hmr: false`, preserving the existing production-compile mode probe.
- `octane-signals-profile`: the native DevTools fixtures with native reads and profiling enabled.
- `octane-signals-browser`: native browser fixtures whose actual served development and production builds explicitly enable native reads, not merely their test-loader transform.

Exclude only the newly opt-in native/profile/browser suites from incompatible default project discovery; do not change existing control compiler settings or remove their tests. Reuse the current helpers and setup files. Compiler-only tests choose their own dev/prod/Strong/nativeReads options under `tests/compiler`, and server-fixture compilation must explicitly receive the matching native option. The production compile lane is not a substitute for real production-bundle tests.

Reuse `tests/_helpers.ts`, `tests/_server-fixture.ts`, the conformance PRNG, and current browser fixtures. Do not add ad-hoc generated-module rewriting, runtime-internal mocks, or another component evaluator.

### Deterministic adversarial sequences

Build a small independent reference model of owner epoch, selection, attempt, accepted value/version, retained result, presentation frame, and consumer lifetimes. The model is an oracle for the public contract, not a second production graph implementation.

- Exhaust short completion permutations across two/three attempts.
- Generate select/write/retry/resolve/reject/yield/end/mount/unmount/frame-release/retire/drain sequences using `OCTANE_FUZZ_SEED`.
- Begin with 50 seeds × 100 engine operations and a smaller rendering budget; scale after measuring test runtime.
- Use controlled promises/iterators and public `act`/events. Assert intermediate snapshots and visible states, not only final convergence.
- Log/minimize failing sequences into durable regression fixtures.
- Demonstrate failures when representative attempt guards, cache-witness replay, clear-all cleanup, committed subscriptions, or frame isolation are deliberately broken; restore immediately.

## Scalability measurements

All sizes below are planned experiment inputs, not established supported limits. Larger/longer cases can be opt-in so routine CI remains bounded.

| Workload                 | Planned scales                                                                                             | Measures and controls                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw versus scoped graph  | 100 / 1,000 / 10,000 nodes; exploratory 100,000                                                            | Construction, reads, sparse/broad writes, equality, diamonds, depth, branch switching, disposal; compare identical 3.2.0 core and wrapper workloads with value checks. |
| Native UI                | Existing small/medium/large scales; extend to 1,000 / 4,000 / 10,000 rows where practical                  | Sparse/broad updates, reorder, remove, clear-all; timing plus valid DOM and survivor identity. Preserve current hook targets.                                          |
| Unrelated graph growth   | Fixed affected subtree with 0 / 100 / 1,000 / 4,000 unrelated owners/siblings                              | Detect global scans; report work normalized by affected nodes/edges. Separate cleanup scope from scheduling block.                                                     |
| Async concurrency        | 1 / 10 / 100 / 1,000 active keys; repeated selection/retry over fixed keys                                 | Readiness/commit latency, starts/aborts/accepted results, stale publication, retained attempts; independent versus genuinely dependent work.                           |
| Async composition        | Existing seven-independent-plus-one-dependent dashboard, plus native variant                               | Preserve logical request starts, final signature, input/keyed identity, held content, and zero mixed visible states.                                                   |
| Continuous lifetime      | One document and shared owner, checkpoints 0 / 100 / 1,000 cycles; optional 10,000                         | Repeated partial/full teardown, retry, latest replacement, frame release, owner retirement; cleanup probes, post-GC heap trend, retainer paths, DevTools off/on.       |
| Compiler                 | Existing 10 / 100 / 1,000 component series plus signal-heavy modules                                       | Cold/warm/incremental compilation, naming analysis, output raw/min/gzip; preserve existing codegen corpus.                                                             |
| Bundle/unused capability | Engine-only, native client, server, no-signals default, nativeReads enabled with no reads, devtools off/on | Raw/gzip/brotli and module reachability; no renderer in engine, no graph in ordinary apps, no TS/Node project in browser compiler.                                     |
| SSR/adoption             | Growing ready graphs and independently adopting boundaries                                                 | Throughput, seed bytes, adoption latency, frame retention; output/adopted identity and user-input isolation are hard controls.                                         |

The current `lifecycle-memory` runner performs 12 cycles over 96 rows per sample and starts a fresh browser context for each sample. Its aggregate 1,000+ cycles do not prove stability in a single long-lived application. Keep its existing listener/subscription/timer probes and add the continuous variant.

Include abort-ignoring, never-settling promises retained externally after owner retirement. A tiny invalidatable attempt record may remain; the former owner tree, DOM, large projections, and unbounded frame history must not. Use retainer snapshots to investigate that distinction. A finalizer deadline, one WeakRef check, or one noisy heap delta is not a sufficient leak oracle.

### Baselines and comparison rules

1. Pinned upstream Octane without signals, using the same existing fixtures: cost imposed on current applications.
2. Raw Alien Signals 3.2.0 versus the scoped engine using the same graph semantics: adapter/ownership cost.
3. Existing `@octanejs/alien-signals` with 1.0.4: separately labeled integration comparison.
4. Repository-locked Solid/Ripple targets with matched work: contextual comparison only; disclose semantic/version differences.

Keep baseline/candidate inputs and commands identical. Capture both controls before and after the final candidate in the same environment; use warmup, repeated/order-balanced samples, and the repository's variance-aware reporting. Keep timing, detailed instrumentation, and heap collection in separate runs.

Preserve every existing deterministic budget and ratio gate. New numeric timing ceilings must be selected from repeatable measurements and written down with justification before acceptance; do not manufacture thresholds from a hoped-for result or widen controls after a regression. Report extra work in compilation, allocation, GC, hydration, or startup rather than treating a shift of cost as a removal.

## Acceptance gates and execution commands

The experimental implementation is ready for assessment only when:

- All in-scope observable contracts pass across applicable engine/DOM, dev/prod, client/server, and hydration modes.
- There is no stale publication, mixed presentation, lost edit, destruction of another consumer's shared state, or revival of retired work.
- Cleanup and post-disposal probes pass; deliberately retained views/frames remain usable until their lease ends.
- Native read validation covers irreversible acceptance paths, not merely post-layout external-store synchronization.
- Naming and type diagnostics preserve existing APIs and never substitute for runtime correctness.
- Ordinary applications and engine-only consumers retain the required import boundaries.
- Existing conformance, semantic benchmark controls, and ratio budgets remain intact.
- The evidence report contains scale and retention results, observed variance, costs, limitations, and an honest recommendation. A slower result is not hidden by changing the workload.

After approval, run from this worktree. Narrow the first command to the new/affected files while iterating:

```sh
pnpm install --frozen-lockfile

pnpm exec vitest run --project octane-signals-node --silent=passed-only
pnpm exec vitest run --project octane-signals --project octane-signals-prod --silent=passed-only
pnpm exec vitest run --project octane-signals-profile --silent=passed-only
pnpm exec vitest run --project octane-signals-browser --maxWorkers=1 --silent=passed-only

pnpm exec vitest run --project octane --project octane-prod packages/octane/tests --silent=passed-only
pnpm exec vitest run --project octane-profile --silent=passed-only
pnpm exec vitest run --project octane-events-browser --maxWorkers=1 --silent=passed-only

pnpm typecheck:files <changed-paths>
pnpm format:files:check <changed-paths>

node benchmarks/bench.mjs --quick --ratios codegen-size bundle-reachability hook-memo template-call-memo
node benchmarks/bench.mjs --quick --ratios signal-favoring async-composition lifecycle-memory
node benchmarks/bench.mjs --quick compiler-throughput news hydration-interactivity
```

Quick runs diagnose; final baseline and candidate runs must use the same full configuration. For existing comparable fixtures, use separate task-owned result locations:

```sh
node benchmarks/bench.mjs --record --baseline-dir=/private/tmp/octane-signals-baseline --results-dir=/private/tmp/octane-signals-baseline-results signal-favoring async-composition codegen-size bundle-reachability
node benchmarks/bench.mjs --compare --baseline-dir=/private/tmp/octane-signals-baseline --results-dir=/private/tmp/octane-signals-candidate-results signal-favoring async-composition codegen-size bundle-reachability
```

Run the first command against the pinned baseline before runtime/compiler edits, and the second against the candidate with identical inputs. New native-only fixtures need a same-version raw-engine/control harness; a revision without the API is not a valid runnable native baseline. Copy the evidence to the final report's durable result location before discarding temporary runs.

Add explicit registration for new benchmark suites and the profile/Node test lanes where the current configuration uses allowlists. Typecheck TSRX programs with `tsrx-tsc --noEmit`, never plain `tsc`, and do not introduce an ambient `declare module '*.tsrx'`.

For a broad core change, run the relevant complete local test/typecheck/build/package checks before handoff; document baseline failures separately from regressions. A PR containing user-facing implementation changes requires patch changesets, `pnpm sync` before any push, the repository's PR provenance, and green current-head CI. The author has enabled CI by marking the PR ready; the earlier skipped draft jobs are not correctness or performance evidence. No release is part of this work.

## Deliverables

- Experimental engine and optional native integration, with documented provisional API and unsupported modes.
- Tests mapped to the matrix above, replayable failure seeds, and proof that representative tests detect broken guards.
- Native Todo/dashboard and lifecycle fixtures that demonstrate the same contracts as the unit tests.
- Development graph/owner inspection through the existing DevTools.
- Benchmark manifests and a final report comparing current Octane, same-version raw Alien, the scoped engine/native adapter, and clearly labeled contextual references.
- A decision record for any requirement that the experiment disproves or cannot support without disproportionate complexity.

Remaining limits must stay visible: browser automation does not fully prove trusted user activation or real OS IME behavior; jsdom does not measure layout/paint; heap diagnostics cannot prove the absence of every leak; ready-state adoption does not transport unfinished producers; and no result here establishes non-DOM host compatibility.

## Primary source references

- [RFC 2](https://github.com/octanejs/RFCs/discussions/2) and [the user's design reply](https://github.com/octanejs/RFCs/discussions/2#discussioncomment-18174418).
- [Pinned Alien Signals system API](https://github.com/stackblitz/alien-signals/blob/077e9cb156fddd2736c23940efb887612fce6196/src/system.ts), [API implementation](https://github.com/stackblitz/alien-signals/blob/077e9cb156fddd2736c23940efb887612fce6196/src/index.ts), and [release notes](https://github.com/stackblitz/alien-signals/releases/tag/v3.2.0).
- [Runtime ownership/transactions](../../packages/octane/src/runtime.ts), [server retry/pass state](../../packages/octane/src/runtime.server.ts), and [the divergence contract](../differences-from-react.md).
- [Compiler](../../packages/octane/src/compiler/compile.js), [hook dependencies](../../packages/octane/src/compiler/hook-deps.js), [optional TypeScript integration](../../packages/octane/src/compiler/typescript.js), and [Volar](../../packages/octane/src/compiler/volar.js).
- [DevTools hook](../../packages/octane/src/devtools-hook.ts), [bridge](../../packages/devtools/src/bridge.ts), and [current DevTools contract](../devtools.md).
- [Test rules](../../.rulesync/rules/testing.md), [Vitest projects](../../vitest.config.js), [benchmark inventory](../../benchmarks/README.md), [runner](../../benchmarks/bench.mjs), and [current lifecycle harness](../../benchmarks/news/runtime-stress.mjs).
