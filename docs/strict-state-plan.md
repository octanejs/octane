# Strict state: making authored rendering read-only

> Produced 2026-07-17 from a design discussion merging two independent proposals
> plus review. Line references are against the 2026-07-17 working tree and will
> drift; function and constant names are the stable anchors.
>
> **Status: HISTORICAL DESIGN PROPOSAL; PARTIALLY SUPERSEDED.**
> [`useLinkedState` shipped in #366](https://github.com/octanejs/octane/pull/366),
> and [opt-in, compiler-only Strong mode shipped in
> #376](https://github.com/octanejs/octane/pull/376). The proposed runtime phase
> guards, per-cell policies, `stateWrites` flags, package declarations, and
> staged rollout below did not ship. They remain historical design context, not
> descriptions of current behavior.

## Current implementation

The shipped replacement for guarded prop/source-driven state updates is
`useLinkedState(source, reconcile, options?)`, not `useKeyedState`:

```ts
const [selection, setSelection, getSelection] = useLinkedState(
	items,
	(nextItems, previous) =>
		nextItems.find((item) => item.id === previous?.value?.id) ?? null,
);
```

The reconciler receives `undefined` initially and the previous committed
`{ source, value }` on later source changes. Its result is available in the same
render. Sources and values default to `Object.is`, including array sources;
composite sources need an explicit `sourceEqual` comparator. The optional
`valueEqual` comparator and compiler-selected third getter are supported across
client, server, hydration, and universal rendering.

Strong mode is an optional compiler contract, not a runtime state policy:

```ts
// octane.config.ts
export default {
	compiler: {
		strong: true,
	},
};
```

A module can also opt itself in by placing `"use strong"` before its imports.
Project-wide configuration applies only to application-owned modules; dependency
and separate workspace packages retain React-compatible behavior unless their own
module opts in. No package compatibility declaration or exception list is needed.
Vite, Rspack, and Rsbuild also accept `strong: true` in their plugin options.

Opted-in modules reject statically provable updater calls during render or
synchronous effect setup, along with render-time `ref.current` writes. The
analysis follows synchronous calls through `useCallback`, `useEffectEvent`, and
functions returned by analyzable `useMemo` factories. Statically known Effect
Event calls during render (`OCTANE_STRONG_RENDER_EFFECT_EVENT_CALL`) and Effect
Events in explicit hook dependency lists
(`OCTANE_STRONG_EFFECT_EVENT_DEPENDENCY`) are also errors. The hooks themselves
remain supported; other explicit dependency lists keep their existing semantics.
Synchronously evaluated state initializers, linked-state reconcilers, and
linked-state equality callbacks are render contexts too. Genuinely deferred
callbacks and effect cleanup remain valid. There is no runtime phase guard,
hook-cell policy, runtime-only enforcement, cleanup ban, or `stateWrites`
configuration in the shipped model.

Strong mode also asserts pure rendering over immutable snapshots for production
call memoization, with bounded state-snapshot mutation and nondeterministic-call
diagnostics. The memoizer trusts every user-authored render call shape rather
than using hook-like names or syntax as a purity proof. Compatibility-mode
consumers retain live-call behavior. See the
current [call contract](./differences-from-react.md#automatic-memoization-and-calls-in-templates)
for the optimization boundary and the limits of static enforcement.

For current authoring guidance, see [State that follows another
value](./tsrx-basics.md#state-that-follows-another-value),
[Strong mode](./tsrx-basics.md#strong-mode), and [Differences from
React](./differences-from-react.md#optional-strong-mode). The numbered sections
below preserve the original, more ambitious proposal; statements about runtime
policy or additional primitives are conditional future ideas unless explicitly
identified as shipped.

## 1. Thesis

Octane should make "authored rendering is read-only" a **language invariant
with production semantics**, not a lint. React's own guidance says rendering
must be pure and effects should synchronize with external systems, yet its
lint blesses conditional self-updates during render and carves exceptions for
layout measurement — compatibility compromises Octane does not need to
inherit. React Compiler's `validateNoSetStateInRender` (and its experimental
effects sibling) shows the React team considers these patterns invalid; they
cannot break the ecosystem over it. A greenfield framework can.

The audience argument is as strong as the correctness one: agent-authored code
pattern-matches React training data, and the two patterns this plan forbids —
setState during render and effect-chain state machines — are the largest
single source of accidental re-render loops, double-fires, and
non-deterministic intermediate states in that corpus. Hard errors with
pattern-specific fix-its redirect an agent in one iteration; a warning is
invisible to a loop that only checks exit codes.

The causal model, which is also the vocabulary the diagnostics teach:

```
events / actions ────────────────▶ state transitions
external sources / resources ────▶ reactive snapshots
props + state + snapshots ───────▶ pure render ───▶ commit
                                                    │
                                                    └──▶ synchronize outward

render ──────────────✗ state
commit lifecycle ────✗ state
```

Four causes, four homes: user-caused work belongs in an event or action;
derivable values belong in render; external input belongs in a source or
resource; external output belongs in synchronization. Effects must not become
a second state machine.

## 2. The invariant and who enforces what

The original proposal would define strictness **dynamically**, using a future
runtime execution-context stack rather than only compiler analysis. That runtime
stack and its setter guards are not implemented. A function boundary does not
prove deferred execution:

```ts
useEffect(() => {
	(() => setValue(1))(); // IIFE — still inside the effect frame
	values.forEach(() => setValue(1)); // sync iteration — still inside
	subscribe(() => setValue(1)); // subscribe may replay synchronously
});
```

Under the proposed runtime policy, all three writes would execute while the
effect frame is on the stack and would be illegal in development **and
production**, regardless of how
many function boundaries they pass through. Conversely, static classification
of "the synchronous body" would miss all of them if the calls were hidden in
an imported helper. The boundary is a **causal turn**, not a function frame:

```
during render                              → illegal
while effect setup/cleanup is on the stack → illegal
after that stack has returned              → legal causal transition
```

Where a callback was *created* is irrelevant; only when it *executes* matters.
Registering callbacks is exactly what effect setup is for, so both of these
would remain legal, with no wrapper required:

```ts
useEffect(() => {
	const observer = new ResizeObserver(() => setSize(readSize()));
	observer.observe(element);
	return () => observer.disconnect();
}, [element]);

useEffect(() => editor.registerListener(setSnapshot), [editor]);
```

The third line of the illegal example — `subscribe` — names the one nuance:
a subscription that **replays synchronously** invokes its callback before
effect setup returns, so that first invocation is still part of the commit
cascade and is rejected; later notifications arrive on new turns and are
legal. The initial value would belong in an initializer or snapshot read. The
proposed, unimplemented `useSource` (§6.4) could encode this split for
sync-replaying stores.

Three layers, with distinct jobs:

| Layer | Current status | Intended role |
| ----- | -------------- | ------------- |
| Compiler | **Shipped**, opt-in Strong mode | Enforce bounded diagnostics and trust the author-asserted immutable-snapshot/pure-render contract when conditioning eligible user-authored calls in production clients. |
| Runtime phase guard | **Not implemented**; historical proposal | Enforce a future runtime policy for user-callable setters/dispatchers in development and production. |
| Dependency compatibility | **Shipped** through package containment | Keep dependencies and separate workspace packages in their existing mode unless their own module opts into Strong mode. |
| Per-cell `stateWrites` policy | **Not implemented**; historical proposal | Attach a hypothetical strict/compat policy to hook cells if runtime enforcement is ever introduced. |

Any future runtime guard would live on user-callable setters and dispatchers —
never on
`scheduleRender`, which legitimate internal work (external stores, Suspense,
actions, hydration, deferred values) also uses. It would fire **before evaluating
a functional updater and before the `Object.is` eager bailout**, so illegal
writes could not hide behind same-value sets or run updater side effects first.

## 3. Rule table (strict semantics)

This table describes the **proposed runtime-backed contract**, not the complete
shipped Strong-mode feature set. In particular, cleanup restrictions, callback-ref
restrictions, runtime guards, and hook-cell policies are not implemented.

| Context                                                                        | Policy                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Render body — component body, `@{ … }` setup, conditional or not               | Hard error                                                                          |
| `useMemo` / `useCallback` bodies, `useState`/`useReducer` initializers         | Hard error (purity)                                                                 |
| Reducers and functional updaters                                               | Hard error, guarded **before** the updater/reducer evaluates                        |
| `useInsertionEffect` setup                                                     | Hard error                                                                          |
| Effect setup frames (`useEffect`, `useLayoutEffect`) — any sync call depth     | Proposed runtime hard error; only statically provable setup writes are rejected today |
| Effect cleanup frames — all effect kinds, update and unmount                   | Hard error                                                                          |
| Callback refs during commit                                                    | Same policy as layout-effect setup; `useLayoutSnapshot` covers measurement (§9 OQ)  |
| DOM event handlers, actions, form actions                                      | Allowed, batched                                                                    |
| Callbacks executing on a later causal turn — async continuations, timers, observers, subscription notifications, deliberate deferral (`queueMicrotask`/`setTimeout`, §7) | Allowed, no wrapper required (§2)                                                   |
| Subscription callbacks replayed synchronously during effect setup              | Hard error — still the commit cascade; read the initial value as a snapshot (§2)    |
| Same-value writes in an illegal context                                        | Still illegal — the guard precedes the eager bailout                                |
| Runtime-internal scheduling (stores, Suspense, hydration, deferred, actions)   | Unguarded; guards apply only to user dispatchers                                    |
| Compat cells (§4), in any context                                              | Existing React semantics, unchanged                                                 |

## 4. Policy provenance and the compat boundary

**Shipped declaration is opt-in and compiler-owned.** `compiler.strong` defaults
to `false`; `compiler: { strong: true }` applies to application-owned source, and
an individual module can opt in with `"use strong"`. Dependencies, including
separate workspace packages nested inside the project root, do not inherit the
application setting. They need no package flag, compatibility allowlist, or
hook-slot ABI change.

The rest of this section preserves the **unimplemented historical proposal**.
`stateWrites: 'strict' | 'compat'`, strict-by-default application compilation,
manifest-level compatibility declarations, and per-cell policy propagation do not
exist in the shipped API.

**A future runtime policy could travel with the hook cell, not the executing
block.** This was the historical load-bearing proposal. A compat hook called
from a strict component —
`packages/base-ui/src/utils/useTransitionStatus.ts` doing render-phase writes
while a strict app component is the current block — must keep working, or
compat bindings would become unusable from strict apps. In that future design,
each hook cell would capture its policy at allocation from the module that
allocated it:

- Compiled modules (`.tsrx` / full-compiled `.tsx`): the compiler would convey the
  bit through the emitted call site (encoding: §9 open question — slot-channel
  encoding vs. a registration table).
- Plain-`.ts` manual-slot callers — the semi-public bindings contract
  (`S`/`subSlot` style) — could default to **compat** in the proposed runtime
  model. This surface is documented as
  not-for-app-code already (tier 2 in `index.ts`); app code on the paved road
  would not allocate a hypothetical compat cell by accident.
- `octane/react` would remain compatible under the proposed runtime model.

A future strict cell would refuse illegal writes **everywhere**: client
(`drainQueue`'s replay only engages compat cells), SSR (the Fizz-style
render-phase replay loop in `runtime.server.ts`, `didScheduleRenderPhaseUpdate`
region), universal rendering (`executeOwner`'s renderCount retry in
`universal.ts`), and the hydration drain
(`drainHydrationRenderPhaseUpdates`). One rule table, five surfaces.

**The replay machinery is permanent.** `octane/react`, the ported bindings,
and the conformance suite keep it load-bearing indefinitely. The permanent
runtime would become policy-aware, nothing more:

```
strict render/effect-frame write → throw
compat render write              → existing replay semantics
ordinary callback write          → schedule normally
```

A future strict-only specialized build could elide the replay paths, but that
is not a payoff this plan claims. Potential benefits would include deterministic
application code, identical development and production guarantees, better agent
diagnostics, simpler reasoning, and compatibility that remains separately
identifiable. Today the conformance render-phase suite
(`conformance/derived-state.test.ts`), differential rig, and SSR replay tests
retain their existing behavior without any `stateWrites` option.

**Current blast radius** (rough lower-bound audit, 2026-07-17): ~25 non-test
direct render-phase writes and ~76 synchronous effect-body writes across the
repo, spanning genuinely different cases:

- Apollo replaces its internal state instance during render when client/query
  identity changes (`useQuery.js`). Its migration can use
  `useLinkedState([client, query], (_source, previous) =>
  createState(previous?.value), { sourceEqual: sameClientAndQuery })`, preserving
  `previousData` while comparing the composite source explicitly.
- Radix `use-size.ts` mixes an initial layout-effect measurement (→
  `useLayoutSnapshot`) with later `ResizeObserver` callback writes (legal —
  callbacks are events).
- Lexical `LexicalContentEditable.tsrx` mixes an immediate layout write with
  an editor-subscription callback — same split.

These packages already retain compatibility through package containment until
(and unless) their migrable cases move to the shipped or future primitives;
nothing forces a migration date.

## 5. Enforcement mechanics

### 5.1 Compiler

The shipped Strong-mode compiler already identifies setters and dispatchers from
tuple positions, tracks local aliases and helpers, distinguishes synchronous
render/effect-setup execution from deferred callbacks, and reports stable
diagnostic codes. Cleanup enforcement, runtime-only/opaque callback enforcement,
and policy propagation remain future design work rather than existing compiler
guarantees.

Diagnostics are machine-readable and carry both ends — the setter's
declaration site and the illegal call site — plus a pattern-specific rewrite:

```
src/Gallery.tsrx:14: [OCTANE_STRONG_RENDER_STATE_UPDATE]
Strong mode does not allow state updates during render.
Use useLinkedState when state needs to reset or change with another value.
```

The compiler **proves or stays silent**. It errors only on writes it can
prove execute inside an illegal frame: direct setter calls in an illegal
context, and calls reached through local aliases and helpers it can trace —
the same prove-or-fall-back posture dependency inference already takes with
custom hooks. A closure handed to an opaque callee is never flagged:

```ts
foo.thing(() => setValue(1)); // sync or async invocation? statically unknowable
```

Static analysis cannot know whether `thing` invokes its callback
synchronously (inside the frame — illegal) or asynchronously (a later turn —
legal), and guessing in either direction is worse than staying silent. A future
runtime guard could catch the synchronous case identically in development and
production, but no such guard exists today. For the same reason there is **no
laundering diagnostic**: deliberate
deferral via `queueMicrotask`/`setTimeout` is a sanctioned escape hatch (§7),
not a smell to police at build time. Callback timing is the runtime's
question, full stop.

### 5.2 Runtime phase stack (future proposal; not implemented)

The runtime already carries most of the phase truth as scattered counters:
`EFFECT_BODY_DEPTH`, `REF_CALLBACK_DEPTH`, `STORE_SYNC_DEPTH`
(`runtime.ts` ~683) and the render-phase classification
(`renderPhaseSelf` / `renderPhaseOther`, ~1652). The historical proposal would
formalize these into an explicit execution-context stack of `{ kind, block }`
frames — render, effect
setup, cleanup, ref callback, updater evaluation, event/action — because raw
`CURRENT_BLOCK` is ambiguous (cleanup can run while an outer render frame
remains ambient).

The proposed user-dispatcher path would then check whether a hypothetical strict
cell is executing under a lifecycle frame and throw before updater evaluation or
the eager bailout. Development would throw the rich message with source LOC and
the same pattern suggestions as the compiler; production would throw a compact
`Octane strict-state violation (E##) in <Gallery>` — enforcement is identical
in both, only verbosity differs (the inverse of the hydration-mismatch split,
where recovery ships to prod and warnings are dev-only).

### 5.3 Renderer parity (future runtime proposal)

A future runtime stack and guard would need equivalent behavior under DOM, SSR,
hydration, and universal rendering. Today Strong diagnostics are compiler checks
across those authored compilation paths; server and universal runtimes do not
consult a strict/compat hook-cell policy.

## 6. Replacement primitives

Only `useLinkedState`, the existing state getter, and already established hooks
such as `useSyncExternalStore` are shipped Octane APIs in this section.
`useLayoutSnapshot`, a core `useHydrated`, and `useSource` are retained future
ideas, not current exports.

### 6.1 `useLinkedState(source, reconcile, options?)` — shipped

Replaces: "adjust/reset state when an input changes" — the pattern React
blesses as a guarded render-phase set, at the cost of a thrown-away render.

```ts
const [selection, setSelection, getSelection] = useLinkedState(
	items,
	() => null,
);
```

- Tuple shape matches `useState`, including the compiler-driven third
  `getState` member.
- On each render the hook compares `source` against the committed source with
  `Object.is` by default, **including when the source is an array**. Arrays are
  not implicitly treated as dependency tuples. Supply `sourceEqual` explicitly
  for element-wise composite identity.
- On a source change, `reconcile(source, previous)` runs **inline in the same
  pass**. `previous` contains the last committed `{ source, value }`, so useful
  local state can survive reconciliation without a render-phase setter.
- A source change starts a new generation: updates queued against the old
  generation are discarded (the reset wins).
- Between source changes the value remains independently editable.
- SSR/hydration: the reconciler is pure per-pass computation; server and
  client derive identically from the same source.
- `useLinkedState(propValue, (value) => value)` is the "follow the prop unless
  the user
  overrode it since" idiom that controlled/uncontrolled widget internals
  hand-roll today.

### 6.2 `useLayoutSnapshot(measure, options?)` — future proposal

Replaces: "measure the DOM after commit, then set state" — physically
legitimate (the DOM did not exist earlier), which argues for a managed
primitive, not unrestricted writes from every layout effect.

```ts
const height = useLayoutSnapshot(() => ref.current?.offsetHeight, {
	initial: 0,
});
```

- `measure` would run at layout timing after commit (post-mutation, pre-paint).
- The result would be compared with the previous snapshot — `Object.is` by default,
  `options.equal` for rect-like shapes — and only a change schedules the
  re-render in which the hook returns the new value. The equality guard being
  **built in** removes the single most common infinite-loop bug in React
  apps; the convergence budget is bounded with dev source attribution.
- First render and SSR would return `options.initial` (else `undefined`);
  `measure` would never run on the server.
- Continuous observation (`ResizeObserver`, scroll) would stay in callbacks,
  which are legal transition sites; the primitive would cover commit-coupled
  measurement
  only.

### 6.3 Core `useHydrated()` — future proposal

This proposed core hook would replace
`const [mounted, setMounted] = useState(false)` plus a mount effect. It would
return `false` on the server and during the first client hydration pass, then
`true` after mount. Octane does not currently export this core hook; a
package-specific hook with the same name does not change that status.

### 6.4 Already shipped, part of the same story

- The `getState` third tuple member removes "effect copies state into a ref
  for async reads" (`docs/differences-from-react.md`, current-state getters).
- Parallel `use()`, route loaders, and the query/resource bindings cover async
  data — the largest historical source of effect-chain state machines.
- `useSyncExternalStore` covers external subscriptions today. A friendlier
  Octane-native `useSource(subscribe, read)` remains an unimplemented future
  idea, with no scheduled rollout phase. If added, it could separate the initial
  synchronous snapshot from later subscription notifications. Bare setters in
  genuinely later callbacks remain legal (§7).

### 6.5 Naming non-goal

`useEffect` keeps its name on the native surface for now. Renaming to
`useSynchronize` would steer agent priors before any error fires, but it cuts
against Octane's core adoption thesis (same hook API), and an agent typing
`useEffect` into a framework without it gets a *less* instructive error than a
targeted rule violation with a fix-it. This is empirically decidable: a possible
future evaluation could run three arms in the evals corpus — (a) `useEffect` plus targeted
diagnostics, (b) both names exported with native docs preferring
`useSynchronize`, (c) a renamed native surface — measuring first-pass semantic
correctness, one-iteration recovery, and **evasion mode**: whether agents
"fix" the error through deferral or suppression rather than the intended
pattern. The measurement overrules taste, in either direction. Current prior:
keep `useEffect`.

## 7. Deferral is the escape hatch

The causal-turn rule (§2) is the **permanent semantic floor**, and
deliberately deferring a write to a later turn is **sanctioned**, not a
loophole:

```ts
useEffect(() => {
	queueMicrotask(() => setShowFocusRing(true)); // new turn — legal by design
});
```

Deferral primitives exist for real work — focus management, after-commit
sequencing, yielding to platform timing — and a deferred write is an ordinary
transition on a new causal turn. The runtime does not (and cannot) tell a
deliberate deferral from any other legitimate async completion, and it does
not try: prohibiting asynchronous completions to prevent deliberate evasion
would be the wrong trade, and the compiler stays out of it entirely (§5.1 —
callback timing is statically unknowable for opaque callees, so there is no
build-time policing of deferral).

Every strict guarantee survives this: render never observes a write, commit
lifecycle never observes a write, and a deferred write is scheduled exactly
like any other callback-turn transition. What deferral gives up is only the
*earliest possible* diagnosis — an agent or author who reaches for
`setTimeout` instead of the intended primitive gets working code, not an
error. The response to that is quality pressure, not prohibition:

- fix-its and docs route the common cases to shipped `useLinkedState` and
  actions, with `useLayoutSnapshot` and `useSource` remaining possible future
  primitives;
- possible future evaluation could monitor whether agent output drifts toward
  deferral instead of those primitives; no continuous phase-4 monitor is
  currently implemented.

The **declared-boundary option** — state transitions only at declared causal
boundaries (events/actions, sources, resources), making a bare setter from an
arbitrary async context an error in its own right — is retained strictly as a
contingency behind gate D with explicit sign-off. With deferral sanctioned it
is further from ever being needed; it would only be revisited if evals showed
systematic abuse that diagnostics and primitives failed to absorb, and it
carries prerequisites (a complete paved road, adoption evidence, a
context-propagation story such as platform `AsyncContext`) that make it a
deliberate, evidence-driven step — the ceremony cliff — never a default.

Shipped package containment preserves existing dependency behavior. Hypothetical
strict/compat hook cells do not exist.

## 8. Rollout and eval gates

The original staged rollout was **not executed**. Current status is:

| Historical milestone | What actually shipped or remains proposed |
| -------------------- | ---------------------------------------- |
| Report-only diagnostics, repository inventory, and codemods | Not implemented; they were not prerequisites for opt-in Strong mode. |
| Replacement primitives | `useLinkedState` shipped in [#366](https://github.com/octanejs/octane/pull/366); `useLayoutSnapshot`, a core `useHydrated`, and `useSource` remain proposals. |
| Render-context enforcement | Opt-in compiler diagnostics shipped in [#376](https://github.com/octanejs/octane/pull/376); runtime phase guards and per-cell policy did not. |
| Effect setup and cleanup | Provable synchronous setup updates are compiler errors in opted-in modules; cleanup restrictions remain unimplemented. |
| Dependency compatibility | Package containment is automatic; no manifest flag, compatibility exception list, or consumer approval is required. |
| Evaluation gates and later policy tightening | Historical ideas only; no completed or scheduled phase/gate is implied. |

The shipped intentional divergence and authoring surface are documented in
[Differences from React](./differences-from-react.md#optional-strong-mode) and
[TSRX basics](./tsrx-basics.md#strong-mode). Future runtime enforcement or
additional public primitives would need their own design, tests, changesets,
and rollout decisions.

## 9. Open questions

- **Future cell-policy encoding, if runtime enforcement is ever adopted**:
  slot-channel encoding (numeric slots already
  distinguish compiled call sites from symbol-ranged binding boundaries in
  prod compiles) vs. an explicit registration table. Needs a perf-neutral
  answer on the two-item `useState` fast path.
- **Future callback-ref policy**: strict error (measurement belongs to
  `useLayoutSnapshot`) or event-like allowance (attach *is* a DOM event of
  sorts)? The shipped compiler does not impose the proposed callback-ref ban.
- **Linked-state adoption**: composite sources already use `Object.is` unless a
  `sourceEqual` comparator is supplied; prior source/value and transition
  generation behavior are implemented. Remaining work concerns migrating real
  bindings rather than designing a separate `useKeyedState` hook.
- **Future `useLayoutSnapshot` equality**: is `Object.is` + user `equal` enough, or
  does a built-in rect comparator earn its place?
- **Plain-`.ts` modules**: application-owned custom hooks inherit application
  Strong mode. Dependency/manual-slot modules remain compatible unless they
  explicitly opt in with `"use strong"`; future runtime policy would need a
  separate ABI decision.
- **`autoMemo` interaction**: strict purity rules strengthen the soundness
  assumptions of compiler region caching (PR #104) — worth folding into the
  default-on analysis for autoMemo.
