# Dedicated Lynx compiler backend: plan for issue #1055

Status: **approved on 2026-10-04, with every decision in §10 taken as
recommended.** Implementation starts with the §2.6 prerequisite and then
Phase 1. This document plans
[#1055](https://github.com/octanejs/octane/issues/1055): add a first-class
`target: 'lynx'` backend, move static topology, binding layout, host operation
selection, and update routing into compiler output, and remove the Lynx
dependency on universal host-plan interpretation and universal host records.

- Written against `da9b1e46c` (`origin/main`, 2026-10-01).
- Refreshed against `76b5b02671` (`origin/main`, 2026-10-04), 179 commits
  later. §2.7 lists what moved. Line numbers below are from the refresh and
  drift quickly, so each one also names its function or flag.

## 1. Summary

- Add a sibling backend, `packages/octane/src/compiler/compile-lynx.js`. It
  lowers one compiler-owned **Lynx template IR** into two thread outputs.
  - **Main thread:** straight-line Element PAPI create functions plus typed
    slot setters.
  - **Background:** component ownership plus compiled value/structure updates
    that emit **slot-addressed deltas**.

  Both outputs come from the same IR, so template identity, binding layout,
  keyed regions, and listener sites agree by construction.
- Extract a host-neutral **owner kernel** from `universal-core.ts` (hooks,
  update queues, scheduler, attempts, Suspense/error routing, the transaction
  phases). Both the universal renderer and the new Lynx runtime consume it.
  Universal behavior stays unchanged, and so does `@octanejs/three`.
- Replace the generic `UniversalHostBatch` command vocabulary on Lynx with a
  versioned, compiler-paired **wire ABI**: `(instance, site)` addresses,
  scalar values, and structural opcodes. Reuse the existing transport,
  acceptance protocol, codec, PAPI adapters, prop normalization, native
  events, lists, refs, and worklets.
- Make native signals and Strong-mode memoization work on this target, as the
  issue requires. Neither works on Lynx today.
- Coexist through an explicit, whole-application `backend` choice. Universal
  stays the default until parity, `benchmarks/lynx-render`, and native gates
  pass. Then switch the default and retire the Lynx-only universal paths.

Prior art changes the starting point. A fork, `Huxpro/octane` branch
`new-lynx`, has already measured and built much of this design (§2.4). The
plan adopts its measured design results and wire vocabulary as inputs, but
implements the backend on `main` as #1055 specifies: independent lowering,
not derivation from universal plans. Decision 1 in §10 confirmed that
choice.

## 2. Findings

### 2.1 Today's pipeline

```text
.lynx.tsrx
  → compileAuthored (shared front end: parse, TSRX checks, native-read and Strong
    diagnostics, signal lowering, Strong auto-memo)       compile.js:10504
  → compileInternal dispatch → compileUniversal           compile.js:10641, 10834
      emits universalPlan(...) JSON trees + universalValue/universalFor calls
  → shared finisher: hook deps, slots, imports, one print  compile.js:10900 onward

background: createUniversalRoot(LynxClientDriver, async transport)    root.ts:243
  universal-core.ts (14,314 lines) interprets plans → blueprints → LogicalRecords
  → reconcile → UniversalHostBatch commands → transport (JSON codec)
main:       installLynxMainThread                    main-thread.ts (2,799 lines)
  first screen: main-renderer.ts (1,736 lines) re-interprets the same plans into
                FirstScreenNode graphs → command batch → host-driver apply
  updates:      core/host-driver.ts (6,291 lines) validates, stages, and applies
                generic commands, template programs, lists, events, and handles
```

The lynx-render fixture (`benchmarks/lynx-render/src/App.lynx.tsrx`) compiles
today, for both layers, to `universalPlan` JSON trees. The row template is a
static nine-host tree with six dynamic slots. The background and main outputs
are 3,037 and 3,021 bytes (799 and 781 bytes gzipped, unminified module
output). They differ only in the runtime module and in
`firstScreenEvent` placeholders for handlers. Both threads then **rediscover
at runtime** what the compiler already knew:

- `compiledFirstScreenProgram` walks the plan (`main-renderer.ts:706`).
- `prepareTemplateProgram` does it again (`host-driver.ts:1270`).
- Per-prop event and update classification runs on both threads
  (`client-driver.ts:1632`, `:1647`).

### 2.2 Where universal interpretation lives

| Layer | Universal-specific work | Size |
| --- | --- | ---: |
| Compiler | Plan emission in `compile-universal.js`; Lynx logic is interleaved with it (thread functions, main-thread render-only, template-program proofs, first-screen events) | 4,892 lines |
| Background | Plan constructors, materializer, collapsed templates, blueprints, `LogicalRecord`/`DraftRecord`, host bindings, classify/encode, compact fast paths, reconciliation, unmount | ~8,000 of `universal-core.ts` |
| Background | `core/client-driver.ts`: capabilities, prop encode/classify, public-handle deltas | 1,667 lines |
| Main | `main-renderer.ts`: one-shot plan interpreter and no-op hooks | 1,731 lines |
| Main | `core/host-driver.ts`: batch validation, staging, and apply for the generic command vocabulary | 6,291 lines |

About 5,100 lines of `universal-core.ts` are host-neutral and reusable. The
ranges below were remeasured on the refresh commit; at `da9b1e46c` the hooks
began about 1,000 lines earlier.

- hooks: `useState` through `startTransition` (6091–7590);
- scheduler, transitions, and replay: `UniversalRootImpl.scheduleOwned` and
  `flushScheduledWork` (from 9120);
- owner identity and claims, including `claimChildOwner` and `executeOwner`
  (2525–2700);
- effects and error routing, between the hooks and `UniversalRootImpl`;
- transactions: `UniversalTransactionImpl` (from 13451).

The hooks touch only `DraftOwner`/`UniversalOwnerRecord`, through
`CURRENT_ATTEMPT`. Their root coupling is four calls: `scheduleOwned`,
`scheduleTransition`, `__scheduleMicrotask`, and `formatUniversalId`. The one
structural seam is `executeOwner` returning `BlueprintNode[]`.

#1652 has since moved two Lynx-only layers behind opt-in supports. Template
programs and collapsed templates now ship only to a driver that passes
`universalHostTemplates` (`universal-core.ts:4855`), and the Lynx background
driver is the only one that does. Host bindings install on first
`universalHostBinding()` call (`:66`, `:13310`). Retiring those paths for Lynx
(§3.4) therefore no longer needs a universal-core refactor: the compiled
backend simply never passes the support.

### 2.3 Compiler gates the backend must change

- `target` is enumerated as `dom | universal | valdi` in `renderers.js:209`.
  The union also appears in `index.d.ts`, `vite.d.ts`, and `compile.js`.
- `universalRuntime` (the thread selector) throws unless the target is
  universal (`universal-runtime.js:36`). `bundler.js:1289` forwards it only
  for `universal` and `valdi`. This must change before anything else.
- `dom: options?.renderer?.target !== 'universal'` at `compile.js:10723`,
  `10907`, and `12520` would treat a new target as DOM. These must become
  `target === 'dom'`.
- Universal output is excluded through `options?.__universal == null` from:
  - `strongMemoEnabled` (`compile.js:11067`);
  - inline hook memo (`:11081`);
  - local void roots (`localVoidRootsEnabled`, `:10927`);
  - pure factories (`octanePureFactoryNames({ clientDom })`, `:10976`);
  - plain-hook memo inlining (`slot-hooks.js:1515`).
- `assertNativeReadOptions` rejects native signal reads for any non-DOM target
  (`native-read-diagnostics.js:86`). `useSignal$` and the other native-read
  routes are gated by `domSignalTarget` (`compile.js:748`).
- Lynx thread metadata assumes a universal renderer in three places:
  `compile-universal.js:1257` (thread directives need `universalRuntime`),
  `compile-renderer-boundaries.js:796` and `:833`, and the renderer-owned
  region checks at `compile-universal.js:4423` and `:4769`.
- Valdi is the dispatch precedent. `compileValdi` (dispatched at
  `compile.js:10664`) lowers to plain JS and re-enters `compileInternal` for the
  shared finisher. Its generated modules call `assertValdiCompilerAbi(1)` before
  registering anything.

### 2.4 Prior work

**Local worktrees.**

- Status: none of `octane-lynx-phase-0` … `phase-10`,
  `octane-lynx-data-lifecycle`, `-demo`, `-events-perf`, or
  `-explorer-runner` has unmerged work. Each branch is squash-merged into
  `main` (#164, #180, #182, #187, #191, #198, #216, #227, #231, #236, #238,
  #243, #245, #258, #346). Every worktree is clean.
- Other branches: the eleven other local `*lynx*` branches are also merged.
- Searches: nothing mentions `compile-lynx` or `target: 'lynx'`. No
  octanejs PR references #1055.
- Related open issue: #888 (Android ART global-reference capacity for eager
  trees). It constrains any native create path.

**`Huxpro/octane` branch `new-lynx`** (head `c2889216f`, 2026-09-30) is a
direct predecessor. This plan draws on its design docs, roadmap issues, and
file layout. Its code is reviewed slice by slice as it is ported.

- Scale: 961 commits ahead of and 671 behind `octanejs/main` on 2026-10-04
  (493 behind on 2026-10-01), with merge-base `d5175ca89` (2026-08-26). The
  head has not moved since 2026-09-30.
- Roadmap issue #372 ("Optimal Lynx") explicitly absorbs #1055's ideas without
  waiting for it.

What it has built or measured:

- **L0 evidence** (`docs/lynx-specialized-target-l0.md`).
  - Setup: a hand-written direct-PAPI program pair on the same Lynx Web driver.
  - First contentful paint at 10k rows: 915 ms versus 1,591 ms for the
    universal path (0.575×).
  - Interpretation: plan interpretation alone is 112 ms of that gap. The rest
    is the interpret → record graph → batch → prepare → generic-apply pipeline
    around identical PAPI calls.
  - Other operations: point updates and selection drop to about 0.55×.
    Storm interactions stay at parity because flush and layout dominate them.
  - Caveat: the prototype's background did no real hook or keyed-diff work.
- **Delta protocol v3**:
  - `RUN`, `SET`, `SET-RUN`, `REMOVE`, `CLEAR`, `MOVE`, and `VIS` ops over
    `(instance, slot)` addresses.
  - Instance handles are dense and never reused; `0` is the end sentinel.
  - Values are scalars only, so validation is one forward scan.
- **Kernel extraction**: a first behavior-neutral slice,
  `packages/octane/src/universal-kernel.ts` (hook cells and update queues),
  with an ordered inventory of the remaining seams.
- **Block core**: `packages/lynx/src/core/block-*.ts`, with a semantic support
  matrix (`docs/lynx-block-semantics.md`), transactional publication rules, an
  ACK pipeline state machine, a compact main-thread product, an experimental
  Element Template backend, and Android 4.1 single-sample qualification.

How it differs from #1055:

- **Not an independent lowering.** `packages/lynx/src/compiler/derive-program.ts`
  derives the program IR from `compileUniversal`'s plans at build time by
  running the runtime lowering through the client driver.
- **Universal fallback remains.** Production selection is two-pass, with a
  whole-entry universal fallback. An explicit `core: 'block'` may still carry
  interpreted universal plan descriptors.
- **No signals or Strong work** for Lynx.

It is also far behind `main`, which has since gained the Strong families,
signal changes, and many compiler fixes.

### 2.5 Benchmark coverage gaps

- `benchmarks/lynx-render` builds **only the background layer**. It never runs
  the main-thread first screen or adoption, and it reports no bundle bytes.
- Its in-process ContextProxy passes objects by reference, while the real
  transport JSON-encodes every message (`core/transport-codec.ts`). The issue
  asks for the descriptions to be refreshed against the actual codec.
- It has no variant abstraction. Octane-only gates match the target name
  `octane-lynx` (`run.mjs:134`, `:311`).
- Current guards are octane-lynx/react-lynx ratios (`baselines/ratios.json`):
  - `create_1k_rows_ms` ≤ 1.8 and `create_10k_rows_ms` ≤ 1.4;
  - `update_1k_rows_ms` ≤ 1.8 and `update_10k_rows_ms` ≤ 1.5;
  - reentrant `drain_ms` (20k vs 10k) ≤ 3.5.
- **No Lynx timing suite runs on pull requests.** They run only in the weekly
  or manual `bench.yml`. `pr-bench.yml` (#1500) covers `js-framework`,
  `bundle-size`, and `bundle-reachability`. Since #1583, the `lynx-table` stage
  and `lynx-list` fixture contract tests do run on every pull request through
  `ci:workflow:test`, but they check behavior, not time.
- Related harnesses:
  - `lynx-bundle-size` has hard budgets, reset on 2026-10-03 to measured + 32
    bytes: preview main gzip ≤ 83,688, IFR main gzip ≤ 89,362, background raw
    = 294,677.
  - `lynx-table`, `lynx-list`, and `lynx-handle-retirement` carry their own
    ratio guards.

### 2.6 Baseline run on `da9b1e46c`

Command: `node benchmarks/lynx-render/run.mjs 5` (Apple M5 Max, Node
v24.18.0). Medians in ms, with relative margin of error in parentheses.

| Operation | octane-lynx | react-lynx | Ratio | Committed guard |
| --- | ---: | ---: | ---: | ---: |
| `empty_startup_ms` | 0.23 (45%) | 0.12 (19%) | 1.9 | none |
| `create_1k_rows_ms` | 6.97 (28%) | 4.90 (30%) | 1.42 | ≤ 1.8 |
| `create_10k_rows_ms` | 81.75 (6%) | 52.20 (20%) | **1.57** | **≤ 1.4** |
| `update_1k_rows_ms` | 1.26 (97%) | 0.92 (16%) | 1.37 | ≤ 1.8 |
| `update_10k_rows_ms` | 7.71 (31%) | 10.79 (22%) | 0.71 | ≤ 1.5 |

Two findings must be resolved before this oracle can gate anything:

1. **The reentrant transport pair is broken on `main`.**
   - Symptom: `octane-lynx-reentrant-{10k,20k}` receives zero
     acknowledgements, and `drain_ms` reads 0.0 ms.
   - Diagnostic: "received object where the wire carries a string".
   - Cause: #885 (2026-08-28) made the transport require codec-encoded
     payloads, but `runReentrantCommits` (`workload.ts:360`) still dispatches
     raw objects.
   - Effect: the payload's `failed` field is set, so `bench.mjs` treats the
     suite as a harness failure (it is not allowlisted), and the `drain_ms`
     ratio guard has had nothing to measure since then.
2. **`create_10k` sits above its guard on this machine** (1.57 against 1.4).
   - The run is 5 samples, with octane's median rme at 6% and react's at 20%.
   - The official gate, `node benchmarks/bench.mjs --quick lynx-render
     --ratios` (3 samples), reports the same breach at 1.93× (93.7 ms against
     48.5 ms), alongside the harness failure from finding 1.
   - Phase 1 must decide whether this is a regression on `main` or a
     host-dependent bound, by an AB run against the commit that set the guard.
   - Phase-level comparisons are octane-compiled versus octane-universal in the
     same session, so this does not block the plan. It does mean the react-lynx
     guards cannot be trusted as gates until it is resolved.

**Update, 2026-10-03.** Both findings were bisected to #885 (`957b91046b`,
which made the transport JSON-encode every message):

- The reentrant failure is the harness bug described above.
- The `create_*` breach is a real lost fast path.
  `prepareLynxHostBatch` takes the dense record store only when
  `Object.isFrozen(command.values)`. Decoded runs are mutable, so every fresh
  mount fell back to one record per host.

A fix exists but is **not committed or opened as a PR**. It sits uncommitted in
worktree `quizzical-thompson-a03e4e`, and no running session owns it. It:

- encodes the reentrant burst through the codec, outside the timer;
- freezes a fresh root's validated runs in `main-thread.ts`;
- adds `benchmarks/lynx-render/workload.test.mjs` to PR CI.

On a 21-sample local run it moved `create_1k` from 1.66× to 1.14× and
`create_10k` from 1.59× to 1.13×. Phase 1's numbers are not trustworthy until
that fix lands, so it is a prerequisite (§10, decision 8).

The 1k operations have margins of error from 28% to 97% at five samples.
Phase gates therefore use nine or more samples, AB/BA order, and
deterministic counters (wire bytes, PAPI calls, component executions) beside
wall-clock time.

### 2.7 What moved between `da9b1e46c` and `76b5b02671`

None of the 179 commits starts a Lynx backend, and nothing contradicts the
architecture below. These change the details:

- **Lynx package.** Small changes only:
  - #1658 accepts `key` and checks authored children in renderer JSX
    namespaces (`intrinsics.ts`, `client-driver.ts`, `main-renderer.ts`).
  - A lazy-ref test was added.
  - `lynx-bundle-size` budgets were reset (§2.5).
- **Universal core.** #1652 put template programs and host bindings behind
  opt-in supports (§2.2), and #1662 dropped dead module-load work from
  universal bundles. Hooks gained `useLazyRef` (#1684). Every line range in
  §2.2 moved.
- **Compiler.** `compile.js` changed by about 1,300 lines. The relevant
  changes:
  - custom-hook slots per call (#1546);
  - signal declarations per custom-hook call (#1553) and captured-declaration
    sharing (#1530, #1635, #1650);
  - hook dependencies that read a later binding (#1657) and generated-method
    dependency collisions (#1672).

  The universal gates in §2.3 are unchanged in substance, at new line numbers.
- **Signals.** Native reads gained transition-candidate producers and an
  Action-capability split (#1678, #1683), and declaration redeclaration
  staging (`redeclaration.ts`). The renderer-independent presentation protocol
  in `signals/read-protocol.ts` (`NativeTransitionConsumer`:
  `prepare`/`validate`/`commit`/`discard`) is the seam a Lynx consumer
  implements (§5.1). The native-read gate itself is unchanged: DOM only.
- **Strong.** New families:
  - render scheduling rejection (#1617);
  - cached inline render calculations (#1611);
  - callback-ref state updates rejected (#1693);
  - Strong migration support across the compiler, CLI, MCP, and evals (#1691);
  - effect-ref recognition (#1669).

  All of these run in the shared front end before renderer dispatch, so
  Lynx output already receives the diagnostics. The production memoization is
  still excluded from universal output. The DOM cache helpers it would need
  are `compilerCacheArray`, `compilerCacheContext`,
  `compilerCacheImmutableArrayFilter`, `compilerCacheMappedArray`,
  `compilerMemoRegion`, and `compilerOwnsContextProvider`.
- **lynx-render.** Root-caused, with an uncommitted fix (§2.6).
- **The fork.** Unchanged (§2.4).

## 3. Target architecture

```text
.tsrx / .tsx
  → compileAuthored: shared front end, unchanged (diagnostics, signals, Strong)
  → compileInternal: target 'lynx' → compileLynx(ast, renderer, thread)
       → LynxTemplateIR (one per module; pure function of source + config)
       → thread 'main-thread':  create fns + site tables + render-only components
       → thread 'background':   components on the owner kernel + template descriptors
  → shared finisher: hook deps/slots, import routing, one AST print + source map

background (Lynx compiled root on owner kernel)
  render → compare accepted vs draft values per site → delta frame
  → existing Lynx transport/codec/acceptance
main (template registry + applier)
  RUN → create_T(...) ; SET → typed setter ; MOVE/REMOVE/CLEAR → PAPI
  → ACK / reject / fault → background publishes ownership, refs, effects
```

### 3.1 What moves into compiler output

| Concern | Today (runtime) | Lynx backend (compile time) |
| --- | --- | --- |
| Static topology | Plan JSON walked on both threads, then re-derived into template programs | One IR shape per template; main gets a straight-line `create_T` |
| Binding layout | Positional slots plus runtime classification of each binding | Compile-time **site table**: kind (`text`, `attr:name`, `class`, `style`, `id`, `dataset`, `event:kind:name`, `ref`, `main-thread-*`, `range`, `spread`) and node index |
| Host operation selection | `events.classify`, `updates.classify`, and prop-bag diffs per prop per render (`client-driver.ts:1632–1660`) | The site kind selects the PAPI setter on main and the compare/encode rule on background |
| Update routing | Blueprint → `LogicalRecord` reconcile → generic commands | Per-instance accepted value vector, `Object.is` compare per site, `SET`/`SET-RUN` emission; keyed ranges emit `RUN`/`MOVE`/`REMOVE` from the LIS reconciler over instance handles |
| Event identity | Listener IDs per host in a root table, re-sent on change | `(instance, site)`. The handler is read from the accepted value vector at dispatch, so a changed closure needs no wire op. Only presence changes (fn ↔ null) emit an op |
| First-screen adoption | Snapshot journal plus structural record comparison | Same handle sequence on both threads. Adoption is an array walk with per-site value checks |

Representation is decided by measurement in Phase 2:

- **A.** Per-template `create_T`, plus generated per-template background update
  functions with straight-line per-site comparisons.
- **B.** `create_T`, plus shared, table-driven typed setters and comparison
  loops keyed by site kind.
- **C.** Compact ahead-of-time program data with a small applier, for large or
  repetitive templates.

The issue warns that generated functions can trade dispatch cost for bundle
growth, so the choice is decided by lynx-render time and per-thread bytes, not
by assumption.

### 3.2 Background runtime

- **Owner kernel**, a new internal module family in `packages/octane/src`
  exposed as `octane/internal/owner-kernel`. It contains:
  - hook cells and update queues;
  - effect phasing;
  - the scheduler: scheduled roots, sync drain, discrete/continuous event
    scopes, transitions;
  - owner claims and identity;
  - the attempt draft/abandon lifecycle;
  - Suspense, error, and Activity state machines;
  - the transaction phase ordering: prepare → acknowledge → publish →
    `afterAccept` → insertion/layout/ref → passive.

  It is extracted from `universal-core.ts` in behavior-neutral slices.
  `universal-core.ts` binds it, so universal and Three keep their behavior,
  with their suites as the oracle.
- **Lynx compiled root** (`packages/lynx/src/compiled/`): component instance
  records (owner + template instances), range reconcilers, the delta producer
  and encoder, event routing by `(instance, site)`, `REF` requests, and the
  adoption driver.

  Per-instance state is limited to:
  - template id and handle;
  - the accepted value vector, holding dynamic sites only;
  - the owning component;
  - child range state.

  Static templates carry only a handle.

### 3.3 Main runtime

- A template registry of `templateId → { digest, create, sites }`, filled by
  generated modules at evaluation time (including lazy chunks).
- An applier: one forward scan over a delta frame, dispatching to pre-bound
  PAPI setters by site kind.
- Per-instance node tables, dense and holding dynamic sites and range anchors
  only.
- A first screen that runs the main-thread specialization of components and
  calls `create_T` directly. There is no `FirstScreenNode` graph and no
  intermediate command batch.

### 3.4 Shared, Lynx-owned, retired

| Shared and reused as-is | Extracted to shared | New and Lynx-owned | Retired for Lynx (after the default switch) |
| --- | --- | --- | --- |
| `core/papi.ts`, `host-props.ts` normalization, `native-events.ts`, `native-event-receiver.ts`, `transport-codec.ts`, the transport acceptance state machine (ready, ack, reject, fault, complete, early-event buffering), `list.ts` recycling, `nodes-ref.ts`, `worklets.ts`, `lifecycle-data.ts`, `background-lifecycle.ts`, `environment.ts`, Rspeedy layers and entries | Owner kernel from `universal-core.ts`; thread-function, worklet, and main-thread-render-only passes from `compile-universal.js` | `compile-lynx.js`, Lynx template IR, compiled root, delta producer and applier, template registry, compiled adoption, `(instance, site)` events | `main-renderer.ts` plan interpreter, generic-command paths in `host-driver.ts`, `client-driver.ts`, the plan-based first-tree journal, Lynx-only universal compensation layers (template-program and collapsed-template support, already opt-in through `universalHostTemplates` since #1652; lazy-instance, run, and teardown capabilities; compact fast paths) |

The last column stays until migration completes (§6). The fork reports that
`@octanejs/three` uses none of those universal capabilities, which makes the
universal-core cleanup in Phase 8 feasible. Phase 8 re-verifies that claim
against `main`.

## 4. ABI between main thread and background

The ABI has two versioned contracts:

- **`LYNX_COMPILER_ABI`**: generated code ⇄ runtime. Covers the IR shape, site
  kinds, and registration calls.
- **`LYNX_COMPILED_WIRE`**: background ⇄ main messages.

Both start at `1`, live in one data-only module (`octane/internal/lynx-abi`),
and are imported by the compiler and both runtimes. That gives the event
grammar, priority table, and site-kind enumeration a single source of truth
without the compiler loading Lynx runtime code.

### 4.1 Pairing and rejection

- Every generated module calls `assertLynxCompilerAbi(N)` before registering
  templates. The adapter rejects a mismatch before any registration, as Valdi
  does.
- The Rspeedy plugin computes a **pair digest** over both layers' template
  manifests and defines it into both entries.
  - Main's `ready` reply carries `{ backend: 'compiled', abi, wire, pair }`.
  - A compiled background root refuses to render on any mismatch, including
    pairing with a universal main.
  - A universal background refuses a compiled main.
  - The diagnostic names both versions.
- Persistent cache keys include target, thread, `LYNX_COMPILER_ABI`, compiler
  version, and renderer configuration. The Rspack salt already covers
  renderers, runtime, and `universalRuntime`; add target and ABI.

### 4.2 Identities

- **Template id**: `moduleKey:index`.
  - `moduleKey` is a short stable hash of the project-relative normalized
    module id.
  - `index` is the template's position in the module IR.
  - Each template also carries a **shape digest** over node types, static
    props, CSS scope, and site kinds and order.
  - Main registers `(id, digest)`. The background sends
    `DEFINE(id, digest)` once per root before a template's first `RUN`. An
    unknown id or a digest mismatch is a pre-accept rejection routed to the
    owning error boundary, which also covers lazy chunks loaded out of order.
- **Instance handle**: a per-root integer, dense, monotonic, and never reused.
  `0` is the end/root sentinel. The main first screen allocates the same
  sequence the background's first render will.
- **Site**: a compile-time index into the template's site table.
- **Listener identity**: `(root, handle, site)`, encoded in the PAPI event
  token. No separate listener table or listener-id range is needed.

### 4.3 Delta frame (background → main)

The frame is one message per accepted commit attempt, using the existing
envelope:

```text
{ protocol, renderer, root, version, ops: [opcode, ...operands, opcode, ...] }
```

The candidate opcodes take the fork's v3 vocabulary as the starting point.
Phase 2 fixes the final list.

| Op | Operands | Meaning |
| --- | --- | --- |
| `DEFINE` | `id, digest` | Bind a template id for this root. Rejected if the registry disagrees |
| `RUN` | `id, parent, rangeSite, before, first, count, …values` | Create `count` instances with handles `first…first+count−1` and insert them into a range site. Values are site-ordered scalars; event sites are bound inside `create_T` |
| `SET` | `handle, site, value` | One typed write |
| `SET_RUN` | `first, stride, site, …values` | Equal-site writes over an arithmetic handle sequence |
| `MOVE` | `handle, parent, rangeSite, before` | Reposition a survivor (LIS output; also portal retargeting) |
| `REMOVE` | `first, count` | Destroy a contiguous handle run, cascading to nested ranges |
| `CLEAR` | `parent, rangeSite` | Destroy every member of a range site |
| `VIS` | `handle, hidden\|visible` | Activity and retained Suspense |
| `EVENT` | `handle, site, on\|off` | Presence change on a nullable event site |
| `REF` | `handle, site` | Request a public handle snapshot in the ACK |
| `SPREAD` | `handle, site, [name, value, …]` | An ordered spread with an unknown name set; main diffs that site's previous keys |
| `WORKLET` | `handle, site, descriptor` | `main-thread:*` props. The descriptor is validated by the codec |
| `LIST` | list-info deltas | Native list metadata. Cells are callback-materialized as today |

Rules for values and frames:

- Values for `RUN`, `SET`, and `SET_RUN` are scalars: string, number, boolean,
  null, and the codec's `undefined` sentinel.
- Structured values travel only in typed ops (`SPREAD`, `WORKLET`, and style
  objects lowered to style text or per-property sites), so validation stays a
  non-recursive forward scan.
- A discarded or suspended attempt produces **no frame**.

### 4.4 Main → background

- **Acknowledgement.** The acknowledgement, rejection, fault, and completion
  semantics are unchanged. A compact acknowledgement is the default; handle
  snapshots appear only for `REF` requests. ACK remains the irreversible
  acceptance point. A rejection before ACK publishes nothing.
- **Events.** `{ root, version, priority, deliveries: [[handle, site, payload], …] }`.
  - The background resolves the handler from the instance's **accepted**
    value vector, never from a draft.
  - Unknown or destroyed handles are dropped as stale.
  - Early-event buffering before background ownership keeps its current
    bounds and exactly-once replay.
- **Lists and worklets.** List callbacks and cross-thread calls keep their
  existing message types.

### 4.5 First-screen adoption

1. Main renders the main-thread specialization synchronously.
   - Each `RUN` executes immediately against PAPI, with no batch.
   - Main retains each instance's `(id, handle, parent site, values)` until
     adoption.
2. The background's first frame is an ordinary frame flagged `adopt`.
3. Main walks the frame against the retained sequence.
   - Matching id and handle run: no PAPI work.
   - A differing scalar value: a repair `SET`.
   - A structural mismatch: destroy that range and create it from the frame,
     with a source-attributed diagnostic.
   - Instances are never silently attached to the wrong identity.
4. Buffered first-screen events map one-to-one because handles agree. They are
   replayed after ACK.
5. Main releases its retained value vectors.

Adoption remains O(instances + dynamic sites). It is not O(1), but it no
longer allocates or compares record graphs.

### 4.6 Worked example: lynx-render row

The spelling below is illustrative; tests do not pin generated spelling.

```js
// main thread
assertLynxCompilerAbi(1);
const ROW = defineTemplate('k3f9:0', 0x5a1c2e07, (papi, h, v) => {
	const n0 = papi.view(); papi.classes(n0, v[0]); papi.id(n0, v[1]);
	const n1 = papi.text(); papi.classes(n1, 'col-id');
	const t1 = papi.rawText(v[2]); papi.append(n1, t1); papi.append(n0, n1);
	const n2 = papi.view(); papi.classes(n2, 'col-label'); papi.event(n2, 'bindEvent', 'tap', h, 3);
	// … remaining static hosts, appended child-before-parent …
	return [n0, n0, t1, n2, t4, n5]; // node per dynamic site
}, SITES_ROW /* class, id, text, event:bind:tap, text, event:bind:tap */);

// background
assertLynxCompilerAbi(1);
const ROW = lynxTemplate('k3f9:0', 0x5a1c2e07, SITES_ROW);
export const BenchApp = defineLynxComponent(function BenchApp(props) {
	const [selected, setSelected] = useState(0, _h$0);
	// …
	return lynxInstance(APP, [`selected=${selected} removed=${removed}`,
		lynxFor(props.rows, (row) => row.id, (row) => lynxInstance(ROW, [
			row.id === selected ? 'row danger' : 'row', `row-${row.id}`, `${row.id}`,
			() => setSelected(row.id), row.label, () => setRemoved((c) => c + 1),
		]))]);
});
```

Tapping a label changes `selected`:

- The background compares two rows' `class` sites and the stats text.
- It emits about three `SET`s.
- The handler closures changed, but they emit nothing.

Today, the same tap re-plans prop bags for every row.

`{row.label}` is a bare renderable hole under `<text>`. The IR gives it a
`text-or-range` site:

- A primitive value is a text write.
- Anything else becomes a structural range.

Phase 4 supports the primitive form. Phase 6 adds structural text children.

## 5. Native signals and Strong mode on Lynx

### 5.1 Signals

- **Compiler.**
  - Add a `native-reads` renderer capability and accept it for `target: 'lynx'`
    in `assertNativeReadOptions`. DOM keeps its existing path.
  - Route `useSignal$` and the `octane/signals` hook module to the Lynx
    runtime for each thread.
  - Keep activation tied to a runtime signals import. A `$` suffix or a
    type-only import is not enough.
  - Keep the naming and dependency diagnostics, and keep
    `OCTANE_NATIVE_READ_TARGET` for boundaries that remain unsupported.
- **Background runtime.**
  - The owner kernel exposes the read-collection seam: begin a native-read
    scope around the actual component invocation, including parameter
    defaults, destructuring, and custom hooks.
  - Reads are provisional per attempt, published on ACK, and released on abort
    or rejection.
  - A signal write schedules its consumer owners through the kernel scheduler.
  - Reuse `signals/native-read-collector.ts`, `owner-context.ts`, and the
    `read-protocol.ts` presentation contract (`NativeTransitionConsumer`), so
    a Lynx consumer prepares, validates, commits, or discards its native work
    the way a DOM consumer does. Do not import `runtime.ts`.
  - Explicit data scopes own producers independently of UI consumers.
- **Granularity.** Phase 5 invalidates at component granularity, which matches
  the DOM contract. Compiled site comparisons then keep a sparse change to the
  changed sites. Region- or site-level signal invalidation is a measured
  follow-up, not a Phase 5 promise.
- **Main first screen.**
  - Main never owns live producers.
  - Synchronous `signal$` initial values and pure synchronous `derived$`
    evaluate on main as immutable presentation values.
  - Async sources render their pending arm.
  - The background adopts and reconciles differences with repair `SET`s. No
    live handle crosses realms, and no producer starts twice.
  - Writes that land between main paint and adoption reconcile through the
    same path.

### 5.2 Strong

- Enable `strongMemoEnabled` for `target: 'lynx'`, along with inline hook memo
  and pure factories where their runtime helpers exist.
- Provide host-neutral versions of the DOM-only Strong cache helpers
  (`compilerCacheArray`, `compilerMemoRegion`, `compilerCacheMappedArray`,
  `compilerCacheImmutableArrayFilter`, and the context pair
  `compilerCacheContext`/`compilerOwnsContextProvider`) in the owner kernel. They store
  owner-local, slot-keyed cache cells and do not copy DOM cache layouts.
- Every cache cell carries read and revision evidence, and a cache hit
  **replays subscriptions**. A stable `signal$` handle is not proof that
  `signal$.get()` is unchanged.
- Keyed-row projections cache per range entry, and the guards witness
  callables, receivers, and arguments.
- Hooks, context subscriptions, suspension points, and effect lifetimes are
  never skipped as pure calculations.
- Abandoned attempts never write cache cells.
- Audit the event-locality diagnostics for Lynx `bind`, `catch`,
  `capture-*`, `global-bind`, and `main-thread:*` spellings.

## 6. Migration and coexistence

- **Selection.** Selection is explicit and whole-application:
  `pluginOctane({ backend: 'compiled' })`, with `'universal'` the default
  until Phase 8.
  - Both layers must use the same backend; the handshake (§4.1) enforces it.
  - There is no per-module or per-expression fallback.
  - An unsupported construct fails compilation with a diagnostic that names
    the construct and the `backend: 'universal'` opt-out.
- **Descriptors.** New `lynxCompiledBackgroundRenderer` and
  `lynxCompiledMainThreadRenderer` (`target: 'lynx'`) sit beside the existing
  universal descriptors in `config.ts`. Standalone `*.lynx.tsrx` rules keep
  universal until the default switch.
- **Runtime packaging.** The compiled runtime ships as separate subpaths, so a
  compiled application's graph never reaches `octane/universal/native`, the
  plan interpreter, or the generic command driver. A bundle-reachability check
  proves it.
  - The public `@octanejs/lynx` facade (`root`, `createLynxRoot`, platform
    hooks) stays source-compatible.
  - The Rspeedy plugin aliases the facade per backend, as it already does for
    the first-screen facade.
- **Tests.** One shared fixture suite runs against both backends throughout
  coexistence. Universal-only behavior is listed explicitly, not silently
  skipped.
- **Retirement.** The default switches only after the Phase 8 gates. The
  universal Lynx path then stays one minor release as the opt-out, and the
  Lynx-only code in §3.4's last column is removed after that. `universal-core`
  stays for `@octanejs/three` and other universal renderers.

## 7. Phases

Every phase lands as its own PR, or a short stack, with:

- current-head CI green;
- a changeset where user-facing;
- a behavioral test with a credible pre-change failure;
- a `benchmarks/lynx-render` result recorded against the Phase 1 baseline in
  the same session (AB/BA order, nine samples, median and relative
  variation).

"No regression" means the candidate's median is within the baseline's observed
variation or better. Numerical budgets are fixed from Phase 1 data. The
provisional targets below are replaced by measured budgets before they gate
anything.

### Phase 1: baseline and measurement harness (benchmarks only, no product code)

- Prerequisite: the #885 regression fix (§2.6) is merged, so the reentrant
  pair measures something and fresh mounts take the dense path again. Phase 1
  does not redo it.
- Pin the baseline: commit, Node version, lockfile, and the `@lynx-js/*`
  versions.
- Make a zero-acknowledgement run fail loudly instead of reporting 0 ms, if
  the prerequisite fix does not already do so.
- Re-run the ratio guards on the fixed `main` and confirm `create_10k` sits
  inside its 1.4 guard. If it does not, AB it against the commit that set the
  guard before changing anything.
- Refactor `lynx-render` into variants, each a name plus its renderers, build,
  and expectations. Replace the name-matched Octane-only gates with
  per-variant expectations, so a compiled variant can join without editing
  them.
- Add first-screen and adoption scenarios:
  - Build the main layer with the main-thread renderer.
  - Time `first_screen_{1k,10k}_ms`: main-thread render through the fake PAPI
    to a flushed tree.
  - Time `adopt_{1k,10k}_ms`: background first render through ACK and
    `adoption-ready`.
  - Assert visible-tree checksum equality and **retained fake-element
    identity** across adoption.
- Charge the transport codec: route the fake ContextProxy through
  `transport-codec` encode and decode so serialization is inside the timer.
  Report wire bytes per operation.
- Add counters, read after each timed interval: PAPI calls by kind, wire
  bytes, frames, component executions, and retained heap after mount and after
  teardown (`--expose-gc`, optional).
- Report per-thread bytes for the fixture graph: minified, gzip, and Brotli.
- Refresh `benchmarks/lynx-render/README.md` against the real codec.
- Add a report-only `lynx-render --quick` to `pr-bench.yml` (decision 9),
  path-filtered to `packages/lynx`, `packages/rspeedy-plugin-octane`, and the
  Lynx compiler files. It reports the deterministic counters beside timing and
  does not block.

**Test.** The harness's own semantic checks:

- node and token counts;
- checksum equality between first screen, adoption, and background-only mount;
- element identity preserved across adoption;
- codec round-trip.

**lynx-render gate.** Existing operation medians reproduce within noise, so
the codec charge is reported as a separate, explained delta. New metrics have
recorded baselines, and new ratio guards are committed. `bench.mjs --quick
lynx-render --ratios` passes.

### Phase 2: owner-kernel extraction and representation spike

- Extract the owner kernel from `universal-core.ts` in behavior-neutral
  slices. This re-does on `main` the seam order the fork inventoried:
  1. hook cells and update queues;
  2. the owner abstraction;
  3. scheduling callbacks;
  4. transition batches;
  5. root services (`useId`, warm memo, bridge context);
  6. claims;
  7. transaction phases.

  `executeOwner` gets a structure-agnostic return seam.
- Spike: a private `packages/lynx/src/compiled/` root on the kernel and a main
  applier, driving a **hand-written** template pair for the lynx-render
  fixture. The pair is exactly what Phase 3 will generate. It runs through the
  real transport, codec, and fake PAPI.
  - Cover mount, update, a thrown-thenable retry, and unmount, with no
    `LogicalRecord`.
  - Include one `useSignal$` component and one Strong-on module to locate the
    native-read and cache seams (§5). Their implementation waits for Phase 5.
- Measure representations A, B, and C (§3.1) on time and per-thread bytes, and
  write the decision record into this document.
- Fix the final opcode list and the ABI constants.

**Test.**

- The universal, Three, conformance, and `octane-prod` suites are unchanged.
- The DOM codegen-size and `bundle-reachability` results are byte-identical.
  The DOM runtime is untouched.
- Spike tests in the official Lynx JavaScript environment: independent keyed
  row state survives a reorder; an abandoned attempt causes zero native
  mutation; teardown leaks no listeners or nodes.

**lynx-render gate.**

- The spike variant matches the checksum.
- Universal-root benchmarks (`root-transactions`, the Three suites) stay
  within noise.
- The spike's `first_screen_10k` and `create_10k` are recorded against the
  baseline as the decision input.

If the spike does not improve first screen and create, stop and revisit
before Phase 3.

### Phase 3: compiler plumbing (`target: 'lynx'`, `compile-lynx.js`)

- Accept `target: 'lynx'` in `renderers.js`, the public types, `bundler.js`,
  `compile-renderer-boundaries.js`, and `slot-hooks.js`. Fix the
  `dom: target !== 'universal'` sites.
- Generalize `universalRuntime` into a thread selector accepted for `lynx`, and
  add target and ABI to the cache salt.
- Extract the thread-function/worklet passes
  (`compile-universal.js:968–1538`), the main-thread render-only pass
  (`1113–1147`), and the shared lexical/validation utilities into a shared
  module. Universal output must not change by a byte.
- Implement `compileLynx`:
  - IR construction;
  - main and background emission as copy-on-write AST with authored origins;
  - re-entry into `compileInternal` for the one shared print;
  - ABI guards.
- Initial surface: static and dynamic props, text, images, native events,
  stateful components, and keyed `@for`.
- Everything else gets a source-attributed diagnostic and the documented
  opt-out.
- Replace the Phase 2 hand-written pair with compiler output.

**Test.**

- Compile and execute both outputs against a recording PAPI.
- Identical template ids, digests, and site tables regardless of compile
  order or worker split.
- An ABI or pair mismatch produces the documented diagnostic.
- Source maps cover the authored origins.
- Explicit and inferred hook dependencies and plain-module custom hooks are
  preserved.
- DOM, universal, and Valdi output is unchanged.

**lynx-render gate.**

- The compiled variant is within noise of the Phase 2 hand-written spike: the
  compiler adds no runtime cost.
- A `codegen-size` sentinel pair (fixture compiled for `lynx` vs `universal`)
  is recorded, and the DOM corpus guards are unchanged.

### Phase 4: dual-thread vertical slice (issue first milestone, part A: hook state)

- Compiled root, applier, first screen, adoption, `(instance, site)` events,
  and keyed `RUN`/`MOVE`/`REMOVE`/`CLEAR`.
- Teardown, early-event delivery, and failed or abandoned attempts.
- Delayed-acknowledgement coalescing, pre-accept rejection, and accepted-fault
  reporting, all preserved.

**Test.** In the official Lynx JavaScript environment:

- mount → main first screen → adoption with the **same native element
  objects** → native tap → update → keyed insert, reorder, and remove →
  unmount;
- early event replayed exactly once;
- abandoned render mutates nothing and publishes no effect, ref, or listener;
- stale generation rejected;
- mismatched pair rejected before render.

**lynx-render gate**, compiled vs universal, same session:

- no regression in any operation;
- provisional targets: `first_screen_10k` ≤ 0.8×, `create_10k` ≤ 1.0×,
  `update_10k` ≤ 1.0×, `adopt_10k` ≤ 1.0×;
- wire bytes and main-thread fixture bytes ≤ universal;
- the existing react-lynx guards still hold.

### Phase 5: signals and Strong (issue first milestone, part B)

- Implement §5.
- Add hook-state and signal variants of the keyed-row fixture, each with
  Strong off and on: a sparse row update, a selection change, derived fan-out,
  batched writes, and a stream update. Every variant must produce identical
  results.

**Test.**

- A changed signal invalidates its readers.
- Memo-cache hits keep subscriptions.
- Unchanged row projections are not recomputed.
- Conditional dependencies, writes during an in-flight commit, stale async
  results, and scope disposal behave correctly.
- An abandoned attempt releases provisional reads and leaves external signal
  state untouched.
- A signal changed between main paint and adoption reconciles.

**lynx-render gate.**

- Correctness is identical across the four variants.
- Counters: a sparse update re-executes only the reading owner and emits only
  changed sites. Strong-on performs ≤ the projection evaluations of Strong-off.
- Report latency and bytes, separating signal-engine microbenchmarks from
  end-to-end numbers.

### Phase 6: semantic and native parity

- Cover remaining hooks, context, component children and render props,
  ordered spreads, dynamic renderables and text children, `@if`/`@switch`,
  `@try`/Suspense and errors, Activity, portals, refs and measurement,
  worklets and `main-thread:*`, cross-thread calls, and lazy components.
- Lower native list cells with demand-driven physical materialization and
  logical state retention.
- Keep the native-list first-screen limitation until dedicated adoption is
  proven.

**Test.**

- The existing supported Lynx behavior suite runs against both backends
  through the same public fixtures.
- Recycled cells never reset the wrong logical component or keep stale
  listeners or refs.
- Signal consumers in recycled cells behave correctly.

**lynx-render gate.** No regression. In addition, compiled variants of
`lynx-table`, `lynx-list` (physical-cell ratio ≤ 0.02 holds), and
`lynx-handle-retirement` meet their existing guards.

### Phase 7: toolchain and production graph

- Rspeedy wiring for both layers, CSS and assets, lazy bundles, and
  development reload.
- HMR compatible versus reconstructing edits: a changed template digest is a
  reconstructing edit.
- Packed external consumers and real development and production
  `.lynx.bundle` builds.

**Test.**

- The packed-consumer matrix passes.
- A bundle-reachability check shows the compiled production graph excludes
  the universal plan interpreter, the generic command driver, the DOM
  runtime, and React/ReactLynx.

**lynx-render gate.** No regression. In addition, `lynx-bundle-size` gains a
`compiled` mode: main and background gzip ≤ the universal IFR equivalents,
with budgets fixed from measurement.

### Phase 8: native qualification, default switch, retirement

- Gather Explorer, Android, and iOS evidence for correctness first, then
  performance.
- Switch the Rspeedy default in its own reviewed change.
- Deprecate, and later remove, the Lynx-only universal paths (§3.4). Remove
  universal-core compensation layers that no remaining renderer uses, after
  re-verifying that Three uses none.
- Update `docs/lynx-native-renderer-plan.md`, `packages/lynx/status.json`, and
  the user documentation.

**Test.** Device lanes per the native platform matrix in
`lynx-native-renderer-plan.md`. Universal and Three suites stay green after
the cleanup.

**lynx-render gate.** The final default build meets every committed guard.
Android and iOS show non-inferiority on first screen, first tap, and sparse
updates before the default switches.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Two parallel efforts (this plan and `new-lynx`) diverge on ABI or semantics | Start from the fork's v3 vocabulary and publication rules. Port its code by reviewed slices with attribution where it passes our gates. Keep the wire ABI single-sourced so the efforts can converge (§10, decision 1) |
| Owner-kernel extraction regresses universal or Three (14k-line file, hot paths) | Behavior-neutral slices, universal, Three, and conformance suites as the oracle, `root-transactions` and Three benchmarks per slice, no DOM runtime change |
| A third implementation of Octane semantics drifts (DOM, universal, Lynx) | The shared kernel owns hooks, scheduler, and transactions. A dual-backend fixture suite and the ReactLynx differential stay in place throughout coexistence |
| Generated code grows bundles and PrimJS bytecode | Choose the representation by measurement (Phase 2), share setters, add per-thread byte budgets, and allow the compact-program option for large templates |
| Adoption is not free; main and background diverge (init data, nondeterminism, signals) | Keep Milestone 6 thread-DCE and determinism diagnostics, O(N) value checks with repair `SET`s, and source-attributed structural repair |
| Text-hole polymorphism and generic renderable holes force runtime region kinds | Explicit `text-or-range` and dynamic-region site kinds. Unsupported shapes get diagnostics, never a silent universal fallback |
| Native capacity: eager compiled creates hit Android limits (#888; fork measured an 8,192-pending-node Template PAPI limit) | Keep list materialization demand-driven, flush in bounded chunks, and gate on device evidence before the default switch |
| A benchmark win does not transfer: no serialization in the harness today, no native paint or layout | Phase 1 charges the codec and adds first screen and adoption. The default switch requires Android/iOS non-inferiority |
| Signals across realms: duplicate producers, stale seeds | Producers are background-only, main renders immutable presentation values, and writes during adoption reconcile through repair `SET`s |
| Strong caches leak across abandoned attempts or miss reactive evidence | Cache cells carry read and revision evidence, are written only on accepted attempts, and are covered by negative tests for each witnessed-input class |
| HMR identity churn when templates change | A digest change is a reconstructing edit with root recreation. Compatible edits keep owner state |
| Device lanes or credentials are unavailable | Record the blocker explicitly. The default does not switch without native evidence |
| Coexistence doubles maintenance | Time-box coexistence: one minor release after the default switch, then removal |

## 9. Out of scope

- HTML SSR or hydration for Lynx.
- The native Element Template API as the default (the fork's experiment
  stays a separate capability study).
- Changing the DOM runtime or `@octanejs/three` behavior.
- Cross-renderer boundaries inside a compiled Lynx application.

## 10. Decisions

The 2026-10-01 plan asked for decisions 1 to 3, and the 2026-10-04 refresh
added 4 to 9. The maintainer took every recommendation on 2026-10-04.

| # | Decision | Taken | Alternatives declined |
| ---: | --- | --- | --- |
| 1 | Relationship to `Huxpro/octane:new-lynx` | Implement on `main` per #1055. Adopt the fork's measured results, v3 wire vocabulary, and publication rules as inputs, and port its code by reviewed slices with attribution | Land the fork as the primary vehicle (it derives from universal plans and is 671 commits behind); ignore it |
| 2 | Phase 1 | Approved as written in §7 | — |
| 3 | Owner-kernel packaging | Internal `octane/internal/owner-kernel` subpath, bound by both universal-core and the Lynx compiled runtime | A private copy in `@octanejs/lynx`, which would let semantics drift |
| 4 | Phase order | As in §7: measurement, then kernel extraction and the hand-written spike, then compiler plumbing | Compiler plumbing first; kernel extraction first |
| 5 | Signals and Strong in the first shippable phase | No. Phase 4 ships hook state behind the experimental opt-in, and Phase 5 adds signals and Strong before anything is documented as usable | Merging Phases 4 and 5 |
| 6 | ABI versioning | Two integers, `LYNX_COMPILER_ABI` and `LYNX_COMPILED_WIRE`, in one data-only module, plus a build-time pair digest (§4.1) | One integer; the package version |
| 7 | Fallback policy | An explicit whole-application `backend` choice with no automatic fallback. An unsupported construct fails compilation with a diagnostic naming the `backend: 'universal'` opt-out (§6) | The fork's whole-entry universal fallback; a per-module fallback with a warning |
| 8 | The #885 lynx-render fix (§2.6) | Lands as its own PR from the `quizzical-thompson-a03e4e` diff, before Phase 1 | Folding it into Phase 1; leaving it to another session |
| 9 | `lynx-render` on pull requests | Report-only `lynx-render --quick` in `pr-bench.yml`, path-filtered to Lynx and compiler files, reporting deterministic counters beside timing | Gating pull requests on counters; weekly only |
