# Causal state: making authored rendering read-only

> Produced 2026-07-17 from a design discussion merging two independent proposals
> plus review. Line references are against the 2026-07-17 working tree and will
> drift; function and constant names are the stable anchors.
>
> **Status: ACCEPTED; foundation implemented 2026-07-19.** Configuration,
> package approval, compiler provenance, hard render/purity diagnostics, and
> DOM/SSR/universal runtime guards are implemented with a rollout default of
> `permissive`. Effect setup/cleanup enforcement, callback provenance,
> replacement primitives, inventory emission, first-party migrations, and the
> default flip remain staged below. Existing replay and lifecycle behavior
> remains available under the explicit `permissive` model.

## 1. Thesis

Octane should make "authored rendering is read-only" a **language invariant
with production semantics**, not a lint. Conditional self-updates during render
and state machines spread across effect chains make code harder to reason about,
introduce discarded work, and create accidental loops. Octane can provide a
better default while retaining an explicit migration boundary for existing code.

The audience argument is as strong as the correctness one: agent-authored code
pattern-matches a large body of existing hook code, and the two patterns this plan forbids —
setState during render and effect-chain state machines — are the largest
single source of accidental re-render loops, double-fires, and
non-deterministic intermediate states in that corpus. Hard errors with
phase-specific guidance redirect an agent in one iteration; a warning is
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

This section describes the permanent causal rule. The foundation release enforces
render and runtime-owned purity frames; lifecycle frames remain report-only until
the staged work in §8 lands.

Causal enforcement is defined **dynamically**, by the runtime's execution-context
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
illegal in causal code — in development **and production** — regardless of how
many function boundaries they pass through. Conversely, static classification
of "the synchronous body" would miss all of them if the calls were hidden in
an imported helper. The boundary is a **causal turn**, not a function frame:

```
during render                              → illegal
while effect setup/cleanup is on the stack → illegal
after that stack has returned              → legal causal transition
```

For phase classification, where a callback was *created* is irrelevant; only when
it *executes* matters.
Registering callbacks is exactly what effect setup is for, so both of these
are legal causal code, no wrapper required:

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
| Compiler                | statically provable writes in compiled modules | Fail early with rich, phase-specific guidance. The ergonomic layer — **not** the semantic defense.                               |
| Runtime phase guard     | every user-callable setter/dispatcher          | **The semantic defense.** Dev + prod, all renderers. Rich diagnostics in dev; compact error code + component name in prod.       |
| State-model boundary    | exact packages resolved as `causal` or `permissive` | Keep existing replay behavior contained to approved permissive packages while causal code receives the new invariant.       |

The guard lives on user-callable setters and dispatchers — never on
`scheduleRender`, which legitimate internal work (external stores, Suspense,
actions, hydration, deferred values) also uses. It fires **before evaluating a
functional updater and before the `Object.is` eager bailout**, so illegal
writes cannot hide behind same-value sets or run updater side effects first.

## 3. Rule table (target causal semantics)

| Context                                                                        | Policy                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Render body — component body, `@{ … }` setup, conditional or not               | Hard error                                                                          |
| `useMemo` bodies and `useState`/`useReducer` initializers                       | Hard error (purity)                                                                 |
| `useCallback` declaration                                                       | Allowed; the callback is judged when it executes                                    |
| A callback statically proven to execute synchronously from a forbidden phase   | Hard error; for example `useEffect(callback)` or `useEffect(() => callback())`      |
| Reducers and functional updaters                                               | Hard error, guarded **before** the updater/reducer evaluates                        |
| `useInsertionEffect` setup                                                     | Hard error                                                                          |
| Effect setup frames (`useEffect`, `useLayoutEffect`) — any sync call depth     | Hard error (phase 4 flip; see §8)                                                   |
| Effect cleanup frames — all effect kinds, update and unmount                   | Hard error                                                                          |
| Callback refs during commit                                                    | Same policy as layout-effect setup; `useLayoutSnapshot` covers measurement (§9 OQ)  |
| DOM event handlers, actions, form actions                                      | Allowed, batched                                                                    |
| Callbacks executing on a later causal turn — async continuations, timers, observers, subscription notifications, deliberate deferral (`queueMicrotask`/`setTimeout`, §7) | Allowed, no wrapper required (§2)                                                   |
| Subscription callbacks replayed synchronously during effect setup              | Hard error — still the commit cascade; read the initial value as a snapshot (§2)    |
| Same-value writes in an illegal context                                        | Still illegal — the guard precedes the eager bailout                                |
| Runtime-internal scheduling (stores, Suspense, hydration, deferred, actions)   | Unguarded; guards apply only to user dispatchers                                    |
| Permissive executing source updating a permissive cell (§4)                    | Existing replay and lifecycle behavior                                              |

## 4. Policy provenance and the permissive boundary

`stateModel` names the programming model rather than the guarded operation. The
project shape is an enum default plus an exact-package enum map:

```ts
compiler: {
	stateModel: {
		default: 'permissive',
		packages: {
			'@vendor/legacy-widgets': 'permissive',
		},
	},
}
```

The rollout begins with `default: 'permissive'` and flips the product default to
`'causal'` only after the foundation, diagnostics, callback provenance,
replacement primitives, inventory, and first-party migrations have landed. The
shape is permanent; this is a migration sequence, not a temporary boolean feature
flag. Package authors use the same field and values:

```json
{
	"octane": {
		"stateModel": "causal"
	}
}
```

Policy resolution is package-granular. Consumer entries use exact dependency
package names; there are no path globs, export-level switches, component wrappers,
inline comments, or per-call suppressions. The application package cannot appear
in `packages`; its model comes from `default`. A dependency declaring `causal` is
accepted directly. A dependency declaring `permissive` requires an explicit
matching consumer approval. A consumer may also classify an undeclared dependency
as `permissive`, which supports source packages published before manifest
declarations exist.

**Policy is two-sided whenever the executing source has an attributed definition
boundary.** Both that source and the target hook cell retain their originating
model. During any forbidden phase the final composition rule is:

| Executing source | Causal cell | Permissive cell |
| ---------------- | ----------- | --------------- |
| Causal           | Throw       | Throw           |
| Permissive       | Throw       | Existing behavior |

Outside a forbidden phase, ordinary updates remain legal in every combination.
This prevents a causal caller from laundering a write through a permissive setter,
and prevents a permissive caller from mutating a causal cell during lifecycle work.

The implemented foundation carries exact definition provenance at compiled
component and custom-hook entry boundaries, and that model remains active through
synchronous nested calls. The compiler additionally proves local aliases and
local call chains.

Runtime-owned pure callbacks need one more ABI before the matrix is complete.
Today a state initializer, memo calculation, reducer, or functional updater is
attributed to the hook invocation or cell that owns its execution. That gives
causal hooks hard purity semantics now, but it does not distinguish a causal
callback handed to a permissive cell from a permissive callback handed to a
causal cell. Correct definition attribution through imported callbacks, returned
functions, opaque setters, `.bind()`, and aggregate values requires a dedicated
**Callback Provenance ABI**; partially branding only statically obvious callbacks
would make the guarantee look complete while leaving laundering paths. Static
diagnostics continue to reject every locally provable causal case in the
meantime. The callback ABI is a prerequisite for lifecycle enforcement and the
causal-default flip (§8), not an unrecorded limitation of the final model.

Arbitrary opaque JavaScript callback boundaries remain subject to the separate
prove-or-stay-silent rule in §5.1. The runtime still enforces the active forbidden
phase and target-cell policy, but it cannot invent an author identity for a
callback that has no compiled or runtime-owned provenance boundary.

Compiler-managed call sites encode their model. A source file covered by
`octane.hookSlots.manual` cannot honestly be labeled causal until that manual ABI
also carries provenance, so the current compiler rejects that combination; the
owning dependency may remain at an explicitly approved permissive boundary while
it migrates. Plain `.ts`/`.js` bindings therefore receive neither an implicit
causal label nor a permanent exemption. A causal cell then refuses illegal writes
**everywhere**: client (`drainQueue`'s replay only
engages permissive cells), SSR (the Fizz-style
render-phase replay loop in `runtime.server.ts`, `didScheduleRenderPhaseUpdate`
region), universal rendering (`executeOwner`'s renderCount retry in
`universal.ts`), and the hydration drain
(`drainHydrationRenderPhaseUpdates`). One rule table, five surfaces.

**The replay machinery is permanent.** Permissive packages, ported bindings, and
the conformance suite keep it load-bearing indefinitely. The permanent runtime
becomes policy-aware, nothing more:

```
causal forbidden-phase write        → throw
permissive source + permissive cell → existing replay semantics
ordinary callback write             → schedule normally
```

A future causal-only specialized build could elide the replay paths, but that
is not a payoff this plan claims. The honest benefits are: deterministic
causal application code, no discarded render pass for native reset patterns,
identical development and production guarantees, better agent diagnostics,
simpler reasoning and profiling for causal components, and permissive code that
remains fully supported and separately identifiable. The conformance
render-phase suite (`conformance/derived-state.test.ts`), the differential
rig, and the SSR replay tests compile their fixtures with an explicit
`stateModel: 'permissive'`, the same way `prod-mode-hydrate.test.ts` pins
explicit prod options.

New causal output carries the first numeric state-model ABI marker. Existing
unmarked output is treated as `permissive`; it is never silently treated as
causal. Deterministic `legacy-precompiled` inventory reporting remains rollout
work. Grandfathering expires at the named **Causal State Policy ABI 1**
(`causal-state-abi-1`) epoch, when unmarked precompiled output requires explicit
consumer approval. The policy ABI boundary, rather than an unrelated
package-version milestone, controls the change.

**Current blast radius** (rough lower-bound audit, 2026-07-17): ~25 non-test
direct render-phase writes and ~76 synchronous effect-body writes across the
repo, spanning genuinely different cases:

- Apollo replaces its internal state instance during render when
  client/query identity changes (`useQuery.js`) — maps exactly to
  `useKeyedState([client, query], createState)`.
- Radix `use-size.ts` mixes an initial layout-effect measurement (→
  `useLayoutSnapshot`) with later `ResizeObserver` callback writes (legal —
  later callback notifications are causal boundaries).
- Lexical `LexicalContentEditable.tsrx` mixes an immediate layout write with
  an editor-subscription callback — same split.

These packages stay permissive until (and unless) their migrable cases move to the
primitives; nothing forces a migration date.

## 5. Enforcement mechanics

### 5.1 Compiler

The compiler identifies setters, dispatchers, and state getters from tuple
position — they are "stability sources" for dep inference (`compile.js`,
stability-sources block) — and tracks them through local custom hooks (#148). The
foundation's phase/effect classification pass follows known writers through local
aliases and helpers and labels each call site as render body,
memo/initializer/reducer/updater, effect setup, cleanup, event handler, or deferred
callback.

Foundation diagnostics are machine-readable and carry both ends — the setter's
declaration site and the illegal call site — plus phase-specific repair guidance.
After the replacement primitives land, a more pattern-specific fix-it can say:

```
error[causal-state/render-write]: `setSelection` is called while <Gallery> renders.
  --> src/Gallery.tsrx:14
   |  declared: src/Gallery.tsrx:6 (useState)
   |
   = Deriving from `items`? `useKeyedState(items, () => null)` resets in the
     same pass — no extra render.
   = Responding to a user action? Call it from the event handler.
   = Measuring after commit? Use `useLayoutSnapshot` rather than copying the
     measurement through an effect.
```

The compiler **proves or stays silent**. It errors only on writes it can
prove execute inside an illegal frame: direct setter calls in an illegal
context, and calls reached through local aliases and helpers it can trace —
the same prove-or-fall-back posture dependency inference already takes with
custom hooks. A closure handed to an opaque callee is never flagged:

```ts
foo.thing(() => setValue(1)); // sync or async invocation? statically unknowable
```

`useCallback` does not make its body illegal: creation and memoization do not
execute that body. A statically proven synchronous invocation does. Therefore
`useEffect(callback)` and `useEffect(() => callback())` are diagnosed, while
passing `callback` to a timer or opaque registrar is not diagnosed merely because
the callback was declared with `useCallback`.

Static analysis cannot know whether `thing` invokes its callback
synchronously (inside the frame — illegal) or asynchronously (a later turn —
legal), and guessing in either direction is worse than deferring to the runtime
guard. Once lifecycle enforcement lands, that guard catches the synchronous case
identically in development and production. During the foundation release, an
opaque effect call remains outside hard enforcement; only statically proven
lifecycle writes receive report-only diagnostics. For the same reason there is
**no laundering diagnostic**: deliberate deferral via
`queueMicrotask`/`setTimeout` is a sanctioned escape hatch (§7), not a smell to
police at build time. Callback timing is ultimately the runtime's question.

### 5.2 Runtime phase stack

This subsection describes the completed lifecycle design. The foundation applies
the same source/cell composition to render and runtime-owned purity frames only.

The runtime already carries most of the phase truth as scattered counters:
`EFFECT_BODY_DEPTH`, `REF_CALLBACK_DEPTH`, `STORE_SYNC_DEPTH`
(`runtime.ts` ~683) and the render-phase classification
(`renderPhaseSelf` / `renderPhaseOther`, ~1652). Formalize these into an
explicit execution-context stack of `{ kind, block }` frames — render, effect
setup, cleanup, ref callback, updater evaluation, event/action — because raw
`CURRENT_BLOCK` is ambiguous (cleanup can run while an outer render frame
remains ambient).

Within one authored definition boundary, the user-dispatcher path checks whether
any forbidden phase remains active, not only the most recent helper call: **any
forbidden phase ancestor wins**. A nested transition, event helper, or action
therefore cannot launder a write out of an enclosing render or effect frame. The
attributed source follows the nearest true component/custom-hook definition
boundary; structural runtime wrappers inherit it. Because package policy is
non-transitive, an approved permissive definition updating its own permissive cell
retains existing behavior beneath a causal caller, while either a causal source or
a causal target cell still rejects the write. Until the Callback Provenance ABI
lands, pure hook callbacks use the owning hook/cell model described in §4. The
two-sided rule is applied before updater evaluation and before the eager bailout.
Compiler diagnostics carry authored source locations; runtime development errors
name the active phase and component. In production, the DOM and server runtimes
throw `Minified Octane error #47` with those arguments encoded in the diagnostic
URL. The universal runtime is outside the initial generated error-code catalog and
currently throws the compact named code `OCTANE_CAUSAL_STATE_WRITE` with the
component name. Enforcement is identical; only the diagnostic format differs by
build and runtime surface.

### 5.3 Renderer parity

Every phase enabled at a rollout stage uses the same provenance contract under
DOM, SSR, hydration, and universal rendering. Each renderer owns its execution
stack, but they implement the same matrix. Server and universal replay loops
consult both policies: permissive-to-permissive work replays exactly as today; a
causal source or causal cell dispatching during server render is the same error it
would be on the client.

## 6. Replacement primitives

All are planned tier-1 Octane exports. Each exists because a forbidden pattern has
a physically legitimate core that deserves a managed home.

### 6.1 `useKeyedState(key, initializer)`

Replaces: "adjust/reset state when an input changes" through a guarded
render-phase set and its thrown-away render.

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
  single-pass, no scheduled retry, no discarded render.
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
  re-render in which the hook returns the new value. The built-in equality guard
  removes a common infinite-loop source; the convergence budget is bounded with
  dev source attribution.
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

### 6.4 Existing pieces and `useSource`

- The `getState` third tuple member removes "effect copies state into a ref
  for async reads" (`docs/differences-from-react.md`, current-state getters).
- Parallel `use()`, route loaders, and the query/resource bindings cover async
  data — the largest historical source of effect-chain state machines.
- `useSyncExternalStore` covers external subscriptions today; a friendlier
  Octane-native `useSource(subscribe, read)` (deliberately not specified here;
  ships before lifecycle enforcement) bakes in the causal-turn split from §2 — the initial
  value arrives via a synchronous snapshot read, and only post-setup
  notifications are transitions — so sync-replaying stores are correct by
  construction. It is the **preferred abstraction, not required
  authorization**: bare setters in genuine later callbacks stay legal (§7).

### 6.5 Naming non-goal

`useEffect` keeps its name on the native surface. The causal model is taught by
the hook's contract and diagnostics rather than by renaming the hook;
pattern-specific guidance arrives with the replacement primitives. Hook naming is
independent of the `stateModel` policy.

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

In the completed lifecycle model, every causal guarantee survives this: render
never observes a write, commit lifecycle never observes a write, and a deferred
write is scheduled exactly like any other callback-turn transition. What deferral
gives up is only the *earliest possible* diagnosis — an agent or author who
reaches for `setTimeout` instead of the intended primitive gets working code, not
an error. The response to that is quality pressure, not prohibition:

- fix-its and docs route the common cases to the primitives that carry the
  intent (`useKeyedState`, `useLayoutSnapshot`, `useSource`, actions);
- evals evasion-mode monitoring (continuous from the native-default phase)
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

Approved permissive packages are unaffected at every stage when their own code
updates their own cells; tightening causal semantics never silently changes that
migration boundary.

## 8. Rollout and eval gates

Every enforcement flip is gated on an `@octanejs/evals` run, not a calendar.
The metrics per gate: rule hit-rate in agent output, first-attempt success,
and **one-iteration recovery** — given the error text alone, does the agent
land on the intended pattern in the next attempt?

| Phase | Contents | Gate |
| ----- | -------- | ---- |
| 0 — foundation (implemented) | Add `stateModel`, nearest-manifest resolution, dependency approval, compiler-managed component/custom-hook markers, cache/HMR participation, two-sided component/cell plumbing, cell-owned hard render/purity enforcement, and report-only lifecycle diagnostics. Manual-slot causal source fails explicitly instead of being mislabeled. Keep the project default `permissive`. | Cross-renderer provenance tests; no dispatch hot-path regression. |
| 1 — guidance and auditability | Publish the rule and four-cause vocabulary to `@octanejs/mcp-server`; emit deterministic package and `legacy-precompiled` inventory; complete the manual-slot ABI and the Callback Provenance ABI for runtime-owned pure/lifecycle callbacks; classify every repository hit; measure first-attempt behavior and one-iteration recovery. | Inventory and diagnostic snapshots are stable across direct compile, Vite, Rspack, Rsbuild, SSR, and production compilation; callback provenance passes both directions of the package matrix without a hot-path regression. |
| 2 — paved road | Land `useKeyedState`, `useLayoutSnapshot`, `useHydrated`, and `useSource`; add codemods; migrate causal first-party cases; mark and approve packages that still require permissive behavior. | Primitives have behavioral tests in every relevant renderer; repository classification reaches zero unexplained causal hits. |
| 3 — render eval gate | Validate the implemented render/purity guard against the held-out eval corpus before treating causal as the recommended app setting. | **Gate A:** evals recovery ≥ baseline; no eval-suite regression. |
| 4 — lifecycle guard | Make effect setup/cleanup writes hard errors for causal code; settle callback refs from audit evidence. | **Gate B:** same bar after phase-2 migrations prove the paved road covers real cases. |
| 5 — native default | Flip the product default from `permissive` to `causal`; retain exact approved dependency entries. Begin continuous evasion-pattern monitoring. | Repository and held-out app corpus pass without a default-wide permissive override. |
| ABI — legacy expiry | At `causal-state-abi-1`, require explicit approval for unmarked precompiled output instead of automatic `legacy-precompiled` grandfathering. | Published-package compatibility exercise and actionable approval diagnostics pass. |
| Conditional | Potential declared-boundary tightening from §7. The causal-turn rule is the permanent floor and this phase may never happen. | **Gate D:** paved-road adoption evidence plus explicit design sign-off. |

Bookkeeping when phases land: an intentional-divergence entry in
`docs/react-parity-migration-plan.md` (semantics divergence for causal cells,
policy divergence overall; conformance stays pinned via permissive compiles), a
section in `docs/differences-from-react.md`, a changeset (`octane` +
the affected compiler integrations/bindings), and the `index.ts` tier-1 comment
gains the four primitives.

## 9. Open questions

- **Callback refs**: causal error (measurement belongs to
  `useLayoutSnapshot`) or event-like allowance (attach *is* a DOM event of
  sorts)? Current lean: error, revisit at phase 4 with audit data.
- **`useKeyedState` edges**: nested-array keys (flat element-wise only, like
  deps), omitted initializer (`useKeyedState(key)` ≡ `(k) => k`?), interaction
  with transitions (does a key change during a transition render participate
  in the deferred lane?).
- **`useLayoutSnapshot` equality**: is `Object.is` + user `equal` enough, or
  does a built-in rect comparator earn its place?
- **`autoMemo` interaction**: causal purity rules strengthen the soundness
  assumptions of compiler region caching (PR #104) — worth folding into the
  default-on analysis for autoMemo.

Resolved foundation detail: the compiler appends a numeric model after the
existing hook slot and stamps causal component/custom-hook functions. Unmarked
functions and cells remain permissive. Pure callbacks inherit the owning
hook/cell model until the phase-1 Callback Provenance ABI lands. Ordinary two-item
`useState` destructuring retains its allocation-free tuple path; manual-slot
causal ABI versioning remains phase-1 auditability work.
