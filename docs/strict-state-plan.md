# Strict state: making authored rendering read-only

> Produced 2026-07-17 from a design discussion merging two independent proposals
> plus review. Line references are against the 2026-07-17 working tree and will
> drift; function and constant names are the stable anchors.
>
> **Status: PROPOSED. Nothing below is implemented.** Today's runtime
> intentionally supports React's full render-phase-update semantics
> (`derived-state.test.ts` pins them); this plan does not change those semantics
> for compat code — it introduces a strict mode alongside them.

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

Strictness is defined **dynamically**, by the runtime's execution-context
stack — not syntactically. A function boundary does not prove deferred
execution:

```ts
useEffect(() => {
	(() => setValue(1))(); // IIFE — still inside the effect frame
	values.forEach(() => setValue(1)); // sync iteration — still inside
	subscribe(() => setValue(1)); // subscribe may replay synchronously
});
```

All three writes execute while the effect frame is on the stack and are
illegal in strict code — in development **and production** — regardless of how
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
are legal strict code, no wrapper required:

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
legal. The initial value belongs in an initializer or snapshot read —
`useSource` (§6.4) bakes this split in so sync-replaying stores are handled
by construction rather than by user discipline.

Three layers, with distinct jobs:

| Layer                   | Scope                                          | Job                                                                                                                             |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Compiler                | statically provable writes in compiled modules | Fail early with rich, pattern-specific fix-its. The ergonomic layer — **not** the semantic defense.                              |
| Runtime phase guard     | every user-callable setter/dispatcher          | **The semantic defense.** Dev + prod, all renderers. Rich diagnostics in dev; compact error code + component name in prod.       |
| Compat mode             | modules that declare `stateWrites: 'compat'`   | React semantics unchanged: guarded replay, the 25-pass cap, "Too many re-renders", SSR/universal replay loops.                   |

The guard lives on user-callable setters and dispatchers — never on
`scheduleRender`, which legitimate internal work (external stores, Suspense,
actions, hydration, deferred values) also uses. It fires **before evaluating a
functional updater and before the `Object.is` eager bailout**, so illegal
writes cannot hide behind same-value sets or run updater side effects first.

## 3. Rule table (strict semantics)

| Context                                                                        | Policy                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Render body — component body, `@{ … }` setup, conditional or not               | Hard error                                                                          |
| `useMemo` / `useCallback` bodies, `useState`/`useReducer` initializers         | Hard error (purity)                                                                 |
| Reducers and functional updaters                                               | Hard error, guarded **before** the updater/reducer evaluates                        |
| `useInsertionEffect` setup                                                     | Hard error                                                                          |
| Effect setup frames (`useEffect`, `useLayoutEffect`) — any sync call depth     | Hard error (phase 3 flip; see §8)                                                   |
| Effect cleanup frames — all effect kinds, update and unmount                   | Hard error                                                                          |
| Callback refs during commit                                                    | Same policy as layout-effect setup; `useLayoutSnapshot` covers measurement (§9 OQ)  |
| DOM event handlers, actions, form actions                                      | Allowed, batched                                                                    |
| Callbacks executing on a later causal turn — async continuations, timers, observers, subscription notifications, deliberate deferral (`queueMicrotask`/`setTimeout`, §7) | Allowed, no wrapper required (§2)                                                   |
| Subscription callbacks replayed synchronously during effect setup              | Hard error — still the commit cascade; read the initial value as a snapshot (§2)    |
| Same-value writes in an illegal context                                        | Still illegal — the guard precedes the eager bailout                                |
| Runtime-internal scheduling (stores, Suspense, hydration, deferred, actions)   | Unguarded; guards apply only to user dispatchers                                    |
| Compat cells (§4), in any context                                              | Existing React semantics, unchanged                                                 |

## 4. Policy provenance and the compat boundary

**Declaration is module-level.** A new compiler option joins the existing bag
(`hmr`, `mode`, `dev`, `autoMemo`, … in `compile.js`): `stateWrites: 'strict' |
'compat'`. The vite plugin compiles application code strict by default;
ported packages declare compat in their build config. There is **no inline
suppression** — no pragma comment, no per-call option. Agents cargo-cult
suppression comments the way they cargo-cult `eslint-disable`; a whole-module
policy flip is the right amount of friction and maps to the real use case
(porting React code, which is file-scoped anyway).

**Policy travels with the hook cell, not the executing block.** This is the
load-bearing mechanic. A compat hook called from a strict component —
`packages/base-ui/src/utils/useTransitionStatus.ts` doing render-phase writes
while a strict app component is the current block — must keep working, or
compat bindings become unusable from strict apps. So each hook cell captures
its policy at allocation, from the declared mode of the module whose code
allocated it:

- Compiled modules (`.tsrx` / full-compiled `.tsx`): the compiler conveys the
  bit through the emitted call site (encoding: §9 open question — slot-channel
  encoding vs. a registration table).
- Plain-`.ts` manual-slot callers — the semi-public bindings contract
  (`S`/`subSlot` style) — default to **compat**. This surface is documented as
  not-for-app-code already (tier 2 in `index.ts`); app code on the paved road
  never allocates a compat cell by accident.
- `octane/react` is always compat.

A strict cell then refuses illegal writes **everywhere**: client
(`drainQueue`'s replay only engages compat cells), SSR (the Fizz-style
render-phase replay loop in `runtime.server.ts`, `didScheduleRenderPhaseUpdate`
region), universal rendering (`executeOwner`'s renderCount retry in
`universal.ts`), and the hydration drain
(`drainHydrationRenderPhaseUpdates`). One rule table, five surfaces.

**The replay machinery is permanent.** `octane/react`, the ported bindings,
and the conformance suite keep it load-bearing indefinitely. The permanent
runtime becomes policy-aware, nothing more:

```
strict render/effect-frame write → throw
compat render write              → existing replay semantics
ordinary callback write          → schedule normally
```

A future strict-only specialized build could elide the replay paths, but that
is not a payoff this plan claims. The honest benefits are: deterministic
strict application code, no discarded render pass for native reset patterns,
identical development and production guarantees, better agent diagnostics,
simpler reasoning and profiling for strict components, and compat code that
remains fully supported and separately identifiable. The conformance
render-phase suite (`conformance/derived-state.test.ts`), the differential
rig, and the SSR replay tests compile their fixtures with an explicit
`stateWrites: 'compat'`, the same way `prod-mode-hydrate.test.ts` pins
explicit prod options.

**Current blast radius** (rough lower-bound audit, 2026-07-17): ~25 non-test
direct render-phase writes and ~76 synchronous effect-body writes across the
repo, spanning genuinely different cases:

- Apollo replaces its internal state instance during render when
  client/query identity changes (`useQuery.js`) — maps exactly to
  `useKeyedState([client, query], createState)`.
- Radix `use-size.ts` mixes an initial layout-effect measurement (→
  `useLayoutSnapshot`) with later `ResizeObserver` callback writes (legal —
  callbacks are events).
- Lexical `LexicalContentEditable.tsrx` mixes an immediate layout write with
  an editor-subscription callback — same split.

These packages stay compat until (and unless) their migrable cases move to the
primitives; nothing forces a migration date.

## 5. Enforcement mechanics

### 5.1 Compiler

The pieces mostly exist. The compiler already identifies setters, dispatchers,
and state getters from tuple position — they are "stability sources" for dep
inference (`compile.js`, stability-sources block) — and already tracks them
through local custom hooks (#148) and classifies render-time calls for
PURE/DEP-PURE decisions. The new work is a phase/effect classification pass
that tracks known writers through aliases and local helpers and labels each
call site: render body, memo/initializer/reducer/updater, effect setup,
cleanup, event handler, or deferred callback.

Diagnostics are machine-readable and carry both ends — the setter's
declaration site and the illegal call site — plus a pattern-specific rewrite:

```
error[strict-state/render-write]: `setSelection` is called while <Gallery> renders.
  --> src/Gallery.tsrx:14
   |  declared: src/Gallery.tsrx:6 (useState)
   |
   = Deriving from `items`? `useKeyedState(items, () => null)` resets in the
     same pass — no extra render.
   = Responding to a user action? Call it from the event handler.
   = Porting React code? Declare `stateWrites: 'compat'` for this module's
     package (there is no inline suppression).
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
legal), and guessing in either direction is worse than deferring to the
runtime guard, which catches the synchronous case identically in dev and
prod. For the same reason there is **no laundering diagnostic**: deliberate
deferral via `queueMicrotask`/`setTimeout` is a sanctioned escape hatch (§7),
not a smell to police at build time. Callback timing is the runtime's
question, full stop.

### 5.2 Runtime phase stack

The runtime already carries most of the phase truth as scattered counters:
`EFFECT_BODY_DEPTH`, `REF_CALLBACK_DEPTH`, `STORE_SYNC_DEPTH`
(`runtime.ts` ~683) and the render-phase classification
(`renderPhaseSelf` / `renderPhaseOther`, ~1652). Formalize these into an
explicit execution-context stack of `{ kind, block }` frames — render, effect
setup, cleanup, ref callback, updater evaluation, event/action — because raw
`CURRENT_BLOCK` is ambiguous (cleanup can run while an outer render frame
remains ambient).

The user-dispatcher path then checks: if the cell is strict and the top frame
is a lifecycle frame, throw. Before updater evaluation, before the eager
bailout. Development throws the rich message with source LOC and the same
pattern suggestions as the compiler; production throws a compact
`Octane strict-state violation (E##) in <Gallery>` — enforcement is identical
in both, only verbosity differs (the inverse of the hydration-mismatch split,
where recovery ships to prod and warnings are dev-only).

### 5.3 Renderer parity

The same stack and the same guard run under DOM, SSR, hydration, and
universal rendering. The server and universal replay loops consult the cell's
policy: compat cells replay exactly as today; a strict cell dispatching during
a server render is the same error it would be on the client.

## 6. Replacement primitives

All are tier-1 exports — "React parity plus deliberately documented Octane
extensions" (`index.ts` tier comment). Each exists because a forbidden pattern
has a physically legitimate core that deserves a managed home.

### 6.1 `useKeyedState(key, initializer)`

Replaces: "adjust/reset state when an input changes" — the pattern React
blesses as a guarded render-phase set, at the cost of a thrown-away render.

```ts
const [selection, setSelection, getSelection] = useKeyedState(
	items,
	() => null,
);
```

- Tuple shape matches `useState`, including the compiler-driven third
  `getState` member.
- On each render the hook compares `key` against the stored key — `Object.is`,
  or element-wise `Object.is` when `key` is an array (dependency-array
  semantics). On change, the initializer re-runs **inline in the same pass**:
  single-pass, no scheduled retry, no discarded render. This is strictly
  cheaper than React's blessed pattern, not just cleaner.
- A key change starts a new generation: updates queued against the old
  generation are discarded (the reset wins).
- Between key changes it is exactly `useState`.
- SSR/hydration: the initializer is pure per-pass computation; server and
  client derive identically from the same key. No replay machinery involved.
- `useKeyedState(propValue, (v) => v)` is the "follow the prop unless the user
  overrode it since" idiom that controlled/uncontrolled widget internals
  hand-roll today.

### 6.2 `useLayoutSnapshot(measure, options?)`

Replaces: "measure the DOM after commit, then set state" — physically
legitimate (the DOM did not exist earlier), which argues for a managed
primitive, not unrestricted writes from every layout effect.

```ts
const height = useLayoutSnapshot(() => ref.current?.offsetHeight, {
	initial: 0,
});
```

- `measure` runs at layout timing after commit (post-mutation, pre-paint).
- The result is compared with the previous snapshot — `Object.is` by default,
  `options.equal` for rect-like shapes — and only a change schedules the
  re-render in which the hook returns the new value. The equality guard being
  **built in** removes the single most common infinite-loop bug in React
  apps; the convergence budget is bounded with dev source attribution.
- First render and SSR return `options.initial` (else `undefined`); `measure`
  never runs on the server.
- Continuous observation (`ResizeObserver`, scroll) stays in callbacks, which
  are legal transition sites; the primitive covers commit-coupled measurement
  only.

### 6.3 `useHydrated()`

Replaces: `const [mounted, setMounted] = useState(false)` + mount effect.
Returns `false` on the server and during the first client (hydration) pass,
`true` after mount — runtime-owned, so no user-visible effect, no
hydration-mismatch hazard.

### 6.4 Already shipped, part of the same story

- The `getState` third tuple member removes "effect copies state into a ref
  for async reads" (`docs/differences-from-react.md`, current-state getters).
- Parallel `use()`, route loaders, and the query/resource bindings cover async
  data — the largest historical source of effect-chain state machines.
- `useSyncExternalStore` covers external subscriptions today; a friendlier
  Octane-native `useSource(subscribe, read)` (deliberately not specified here;
  ships with phase 4) bakes in the causal-turn split from §2 — the initial
  value arrives via a synchronous snapshot read, and only post-setup
  notifications are transitions — so sync-replaying stores are correct by
  construction. It is the **preferred abstraction, not required
  authorization**: bare setters in genuine later callbacks stay legal (§7).

### 6.5 Naming non-goal

`useEffect` keeps its name on the native surface for now. Renaming to
`useSynchronize` would steer agent priors before any error fires, but it cuts
against Octane's core adoption thesis (same hook API), and an agent typing
`useEffect` into a framework without it gets a *less* instructive error than a
targeted rule violation with a fix-it. This is empirically decidable: gate C
(§8) runs three arms in the evals corpus — (a) `useEffect` plus targeted
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

- fix-its and docs route the common cases to the primitives that carry the
  intent (`useKeyedState`, `useLayoutSnapshot`, `useSource`, actions);
- evals evasion-mode monitoring (gate C's metric, continuous from phase 4)
  watches whether agent output drifts toward deferral *instead of* those
  primitives — a drift is a diagnostics/docs quality signal first.

The **declared-boundary option** — state transitions only at declared causal
boundaries (events/actions, sources, resources), making a bare setter from an
arbitrary async context an error in its own right — is retained strictly as a
contingency behind gate D with explicit sign-off. With deferral sanctioned it
is further from ever being needed; it would only be revisited if evals showed
systematic abuse that diagnostics and primitives failed to absorb, and it
carries prerequisites (a complete paved road, adoption evidence, a
context-propagation story such as platform `AsyncContext`) that make it a
deliberate, evidence-driven step — the ceremony cliff — never a default.

Compat cells are unaffected at every stage — tightening strict semantics
never re-breaks ported bindings.

## 8. Rollout and eval gates

Every enforcement flip is gated on an `@octanejs/evals` run, not a calendar.
The metrics per gate: rule hit-rate in agent output, first-attempt success,
and **one-iteration recovery** — given the error text alone, does the agent
land on the intended pattern in the next attempt?

| Phase | Contents                                                                                                                                                              | Gate                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0     | Report-only compiler diagnostics; classify the repo (CI artifact of every hit); ship the rules + the four-cause vocabulary to `@octanejs/mcp-server` so agents get them **before** the first error. | —                                                                          |
| 1     | Land `useKeyedState`, `useLayoutSnapshot`, `useHydrated` + codemods; migrate the repo's migrable strict-side cases; bindings declare compat explicitly.                  | Primitives differential-tested; repo classification reaches zero strict-side hits. |
| 2     | Render-context writes (rows 1–4 of §3) become hard errors in strict code, compiler + runtime, all renderers.                                                            | **Gate A**: evals recovery ≥ baseline; no eval-suite regression.           |
| 3     | Effect setup/cleanup frame writes become hard errors in strict code.                                                                                                    | **Gate B**: same bar, after phase-1 migrations prove the primitives cover the real cases. |
| 4     | Ship `useSource`; callback-ref decision (§9); evasion-mode monitoring goes continuous.                                                                                  | Evals evasion-pattern monitoring stays flat.                               |
| 5     | *(Conditional — may never be taken.)* Declared-boundary tightening per §7. The causal-turn rule is the permanent floor either way.                                       | **Gate D**: paved-road adoption metric; explicit sign-off — this is the ceremony cliff. |
| C     | (any time) `useEffect` naming eval, three arms per §6.5.                                                                                                                | Measurement decides; record the outcome here.                              |

Bookkeeping when phases land: an intentional-divergence entry in
`docs/react-parity-migration-plan.md` (semantics divergence for strict cells,
policy divergence overall; conformance stays pinned via compat compiles), a
section in `docs/differences-from-react.md`, a changeset (`octane` +
`@octanejs/vite-plugin`), and the `index.ts` tier-1 comment gains the three
primitives.

## 9. Open questions

- **Cell-policy encoding**: slot-channel encoding (numeric slots already
  distinguish compiled call sites from symbol-ranged binding boundaries in
  prod compiles) vs. an explicit registration table. Needs a perf-neutral
  answer on the two-item `useState` fast path.
- **Callback refs**: strict error (measurement belongs to
  `useLayoutSnapshot`) or event-like allowance (attach *is* a DOM event of
  sorts)? Current lean: error, revisit at phase 4 with audit data.
- **`useKeyedState` edges**: nested-array keys (flat element-wise only, like
  deps), omitted initializer (`useKeyedState(key)` ≡ `(k) => k`?), interaction
  with transitions (does a key change during a transition render participate
  in the deferred lane?).
- **`useLayoutSnapshot` equality**: is `Object.is` + user `equal` enough, or
  does a built-in rect comparator earn its place?
- **Plain-`.ts` app modules**: they default to compat via the manual-slot
  surface, which is a real (documented) hole in strict coverage. Acceptable
  as the cost of the bindings contract, or worth a strict variant of the
  manual-slot API later?
- **`autoMemo` interaction**: strict purity rules strengthen the soundness
  assumptions of compiler region caching (PR #104) — worth folding into the
  default-on analysis for autoMemo.
