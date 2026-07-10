# Octane UI-Library Port Plan: Radix UI Primitives

> **⚠️ Historical record.** This is an execution plan, kept as a record of the
> reasoning at the time it was written — parts of its premise have since been
> superseded by the live implementation. In particular, octane now ships
> React-parity **controlled components** (2026-07-08; see the reversal note in
> the form-primitives section), so any "octane has no controlled inputs"
> adaptation described below is obsolete. For current behavior, trust
> `packages/octane/src/runtime.ts`, `docs/differences-from-react.md`, and the
> `@octanejs/radix` sources/tests over this document.

> Recommendation + phased plan from a research pass that evaluated **Base UI**, **Radix UI**,
> and **React Aria** against octane's actual runtime/compiler source and the existing
> `@octanejs/floating-ui` port. Radix won on fit × value × effort.
>
> **Progress (2026-07-01):** `@octanejs/radix` — **Phase 0 foundation + Phase 1 stateful
> components** landed, at full fidelity. Foundation: `Slot`/`Slottable`, `Primitive.<tag>`
> (`asChild`), `mergeProps`, `composeRefs`/`useComposedRefs`, `composeEventHandlers`,
> `useControllableState`, `Presence`, and the full **`createContextScope`**
> (`createContext` + `createScope` + `composeContextScopes`, slot-threaded). Components:
> `Separator`, `Label`, `Collapsible` (Presence-wrapped `ContentImpl` with the
> `--radix-collapsible-content-height/-width` measurement + exit-animation defer), and
> `Accordion` (single + multiple) — `createAccordionScope` composes `createCollapsibleScope`
> and every part threads `__scope*`, with a dedicated scope-isolation test (a user
> Collapsible between `Item` and `Trigger` cannot hijack the Accordion). 11 tests.
>
> Porting at full fidelity surfaced + fixed **two octane parity bugs** (the point of the
> exercise): (1) `aria-*` attributes are enumerated — `aria-expanded={false}` now renders
> `"false"` (not removed), fixed in `setAttribute`/`ssrAttr`; (2) **`flushSync` didn't drain
> `useLayoutEffect` → `setState` cascades synchronously** (deferred them to a microtask, so
> Presence-style derived state was observed mid-cascade) — `flushSync` now loops
> render → layout-effects with **convergence detection**: it drains while each pass schedules
> only not-yet-seen blocks, and defers to the async scheduler the moment a block re-schedules
> itself. That second part preserves octane's deliberate unstable-`getSnapshot` forgiveness
> (React throws "maximum update depth"; octane advances such cascades lazily) — pinned by
> zustand's `extras.test.ts` fresh-object-selector test, which the first (unconditional-loop)
> version of this fix broke by spinning it forever.
>
> **Differential harness LIVE (2026-07-01):** `radix-ui@1.6.1` (the unified real-Radix
> package — same namespace shape as `@octanejs/radix`) is in the catalog; the SAME `.tsrx`
> fixture now runs through `@octanejs/radix` (octane) AND real Radix (React) with
> byte-identical-DOM assertions (`packages/radix/tests/differential/`, setup rewrites
> `@octanejs/radix` → `radix-ui`). The shared rig gained `useId`-token canonicalisation
> (octane `:in-N:` vs React `_r_N_`/`«rN»`/`:rN:` → positional placeholders, so id
> REFERENCES still must line up) and empty-`style=""`-residue stripping. **5 parity tests
> green** (Separator, Label, Collapsible open/close, Accordion single + multiple). The
> harness immediately caught + we fixed three fidelity gaps: `aria-controls` must be absent
> while collapsed; ids must be `radix-` prefixed (ported `@radix-ui/react-id` → `useId.ts`);
> and triggers must carry `data-radix-collection-item` — which drove a full port of
> `@radix-ui/react-collection` (`collection.ts`) and, with it, **Accordion's real keyboard
> navigation** (Home/End/Arrow with orientation + direction, the Collection-driven
> `handleKeyDown` — Radix's Accordion never used RovingFocusGroup).
>
> **Phase 3 begun (2026-07-02) — the Dialog chain landed at full fidelity.** New infra
> ports: `Portal` (react-portal → octane `createPortal`; octane's `createPortal` body TYPE
> widened to any renderable — the runtime always normalized it), `DismissableLayer`
> (Escape / pointer-down-outside with the deferred-click pairing / focus-outside + layer
> stack + body pointer-events + branches + dismissable surfaces), `FocusScope` (trap/loop,
> mount/unmount autofocus events, scope stack), `focus-guards`, `useScrollLock` (the
> focused `react-remove-scroll` replacement — divergence documented in scroll-lock.ts),
> and the framework-agnostic `aria-hidden` package reused as-is (hideOthers). `Dialog`
> itself: Root/Trigger/Portal/Overlay/Content(Modal+NonModal)/Title/Description/Close.
> Verified: 6 unit tests (portal'd ARIA wiring, focus trap + guards + hideOthers + scroll
> lock, Escape, deferred outside-click, close + trigger refocus) and a differential
> parity test vs real Radix (non-modal; modal traps would fight across the two mounts
> sharing one document — a non-modal dialog dismissing on outside focusin is BY DESIGN,
> so the fixture prevents `onFocusOutside` identically on both sides).
>
> This phase surfaced + fixed a CRITICAL binding bug mirroring Radix's own history: the
> legacy Slot pattern built the composed ref FRESH each render → the renderer
> detach(null)/re-attach cycle re-rendered every state-setter-ref consumer
> (DismissableLayer/FocusScope/Presence `setNode`) → infinite loop. Ported the MODERN
> react-slot instead (memoized `useComposedRefs`), and `Primitive` now renders `Slot` as
> a component (own hook scope) rather than calling it inline. Also: octane's `useEffect`
> with NO deps (run-every-render) is exercised by Collection's ItemSlot registration.
>
> **AlertDialog + RovingFocusGroup + Toggle/ToggleGroup/Tabs (2026-07-02).** AlertDialog
> is the faithful thin-over-Dialog port (always modal, `role=alertdialog`, outside
> interactions never dismiss, Cancel autofocused). **RovingFocusGroup** landed in full
> (single tab stop, entry-focus custom event, arrow/Home/End/PageUp/PageDown intents with
> orientation + RTL awareness, loop, focusable-count fallback) — and with it
> **Toggle**, **ToggleGroup** (single→radiogroup semantics / multiple), and **Tabs**
> (automatic/manual activation on mousedown/keyboard/focus, Presence-mounted panels).
> Verified: 5 new differential parity tests vs real Radix (Toggle on/off, ToggleGroup
> single + multiple incl. roving tabindex bytes, Tabs mousedown activation — jsdom's
> `.click()` emits no mousedown, so the fixture dispatches a real one) and 6 unit tests
> (AlertDialog modal specifics; Tabs arrow/Home/End keyboard nav + roving tab stops).
>
> **Third octane parity bug found + fixed**: octane's DELEGATED dispatch left
> `event.currentTarget` as the delegation root — React guarantees each handler sees its
> OWN element. RovingFocusGroup's `event.target === event.currentTarget` guard (ubiquitous
> in ported React code) exposed it. Both bubble + capture walks now shadow `currentTarget`
> per-handler and restore native semantics after dispatch (`tests/current-target.test.ts`).
>
> **Source-of-truth switch (2026-07-02):** ports now come from the REAL radix-ui/primitives
> TypeScript source on GitHub, not the compiled npm dists. A pinned checkout lives at
> `.radix-primitives/` (gitignored; commit `baa70937` — the "New release (#3984)" bump that
> published exactly the installed `radix-ui@1.6.1` / `react-dialog@1.1.18` set; re-clone
> with `git clone https://github.com/radix-ui/primitives .radix-primitives && git -C
> .radix-primitives checkout baa70937`). Auditing the existing ports against source found +
> fixed three fidelity gaps the dist path missed: `useControllableState` (onChange ref
> synced via `useInsertionEffect`; restructured as source's `useUncontrolledState`),
> `Presence` (source's `useStableComposedRefs` — identity NEVER changes, Radix's own fix
> for the ref-loop class we hit, radix-ui/primitives#3664; the `animationFillMode:
> 'forwards'` exit-flash prevention; `CSS.escape` in the animation-name compare; stylesRef
> nulled on detach), and `Label` (the form-control press guard returns BEFORE the user's
> `onMouseDown` — previously composed after). The only env-gated dev code in any ported
> package is `useControllableState`'s controlled↔uncontrolled switch warning — skipped per
> repo policy (port functional outcomes, not React's dev-warning surface). New-port
> convention: file headers cite the source path under `.radix-primitives/packages/react/`.
>
> **Quick-wins batch (2026-07-02):** `AspectRatio`, `VisuallyHidden` (exported
> `VISUALLY_HIDDEN_STYLES`), `Avatar` (image-probe loading state machine +
> delayMs Fallback), `Progress`, and `Toolbar` (RovingFocusGroup root + embedded
> non-roving ToggleGroup + flipped Separator + space-clicks-Link), plus `use-size.ts`
> (ResizeObserver, jsdom-guarded) and the standalone `Arrow`. All differential-verified:
> **12 parity tests green vs real Radix**. (TSRX parser note: `ratio={16 / 9}` mis-lexes
> `/` in attribute position — hoist to a const.)
>
> **Phase 3 Popper overlays landed (2026-07-02):** `Popper` itself ports onto
> `@octanejs/floating-ui` via its newly-exported bare positioning core
> (`usePositionFloating`) — anchor (virtualRef support, commit-phase callback ref per
> radix#3858), content (fixed strategy, offset/shift/flip/size/arrow/hide +
> transformOrigin middleware, `--radix-popper-*` CSS vars, `data-radix-popper-content-wrapper`
> pre-positioned wrapper), arrow (OPPOSITE_SIDE span). On top of it, at full fidelity:
> **`Tooltip`** (Provider delay/skip-delay refs, TOOLTIP_OPEN document event, grace-area
> convex hull, VisuallyHidden a11y copy), **`Popover`** (modal via hideOthers+scroll lock /
> non-modal outside-interaction bookkeeping, custom Anchor), **`HoverCard`**
> (open/close delays, selection containment, tabbables removed from tab order), the big
> shared **`Menu`** primitive (FocusScope + DismissableLayer + RovingFocusGroup +
> Collection over Popper.Content; typeahead with wrap-around `getNextMatch`;
> checkbox/radio items + Presence indicators; `Sub`/`SubTrigger`/`SubContent` with the
> pointer-grace polygon), and its consumers **`DropdownMenu`** and **`ContextMenu`**
> (virtual anchor pinned to the right-click/long-press point). Helper ports:
> `direction.ts`, `use-callback-ref.ts`. `Slot` gained the single-element-ARRAY unwrap
> (octane's children-as-array-prop convention; React's `Children.only` shape). Verified:
> tooltip 3, popover 4, hovercard 3, dropdown-menu 6 (incl. the submenu keyboard chain:
> ArrowRight opens / ArrowLeft closes + refocuses trigger / select closes the whole tree),
> context-menu 2 — **radix project 53/53 green**.
>
> **Fourth + fifth octane parity bugs found + fixed (the point of the exercise):**
> (4) **Pending passive effects didn't flush before the next render pass.** React runs
> `flushPassiveEffects` at the start of `performWorkOnRoot`/`commitRoot`; octane deferred
> all passives to post-paint unconditionally, so a layout-effect-driven cascade (Presence
> reveal) merged two commits' passives into ONE child-first drain — a freshly-mounted
> child's listener-attach effect ran BEFORE the parent's open-announcement dispatch, so
> Radix Tooltip heard its own TOOLTIP_OPEN and self-closed. Both `flush()` and
> `flushSync`'s convergence loop now drain pending passives before each render wave
> (`drainPassivesBeforeRender`). Regression test: `effect-timing.test.ts` (fails
> `['attach','dispatch','received']` without the fix; `['dispatch','attach']` with).
> NOTE: this corrected `activity.test.ts`'s "skips a passive queued before hide" — that
> assertion pinned the pre-fix incidental ordering; per React's mechanics the queued
> passive mounts against the still-visible tree and the hide then disconnects it (test
> rewritten to assert mount→disconnect→re-mount-on-reveal).
> (5) **The enter/leave event family never fired.** `onPointerEnter`/`onPointerLeave`/
> `onMouseEnter`/`onMouseLeave` don't bubble, so bubble-phase root delegation never saw
> them. Now capture-delegated (the focus/blur treatment) but dispatched to the TARGET
> ONLY — the browser sends each entered/left element its own event, so the focus/blur
> ancestor walk would double-fire ancestors (matches React: enter/leave don't bubble).
> Surfaced by HoverCard's pointer-enter; regression: `enter-leave-events.test.ts`.
>
> **ScrollArea (2026-07-02):** full port (scroll-area.tsx + use-state-machine.ts) —
> viewport with hidden-native-scrollbar injected `<style>` + `display: table` content
> wrapper, all four visibility strategies (`hover` enter/leave + hide delay, `scroll`
> state machine, `auto` overflow measurement, `always`), thumb geometry (linearScale /
> getThumbSize / drag + wheel scroll math verbatim), the unlinked-rAF thumb-position
> loop, and Corner. `@radix-ui/number`'s clamp inlined. ResizeObserver jsdom-guarded;
> tests stub a minimal RO + viewport sizes to drive REAL measurement (hover reveals
> scrollbar + thumb at ratio 1/3, hides after delay; scroll machine
> hidden→scrolling→idle→hidden on real scroll events). 6 tests.
>
> **SIXTH octane parity bug found + fixed:** `dangerouslySetInnerHTML` on the DE-OPT
> host path (`createElement`-built elements) rendered EMPTY — applyDeoptProps wrote
> `el.innerHTML`, then the unconditional child reconciliation ran with (empty) children
> and wiped it. React contract: children and dangerouslySetInnerHTML are mutually
> exclusive — hostElementBody (all three branches, incl. hydration adopt/mismatch) and
> the value-position host reconciler now skip child processing when the prop is present
> (SSR already implemented raw-HTML-wins). Surfaced by ScrollArea's injected viewport
> `<style>`. Regression: danger-html.test.ts de-opt case.
>
> **Phase-4 form batch landed (2026-07-02):** `Checkbox` (indeterminate, form reset),
> `Switch`, `Radio`+`RadioGroup` (roving focus checks-on-arrow via a real `.click()`),
> `Slider` (multi-thumb, sorted values, keyboard steps + Home/End/Shift-skip, pointer
> capture machinery), and `Form` (native Constraint Validation: per-field ValidityState
> capture on `invalid`/`change`, custom sync/async matchers over FormData with
> `setCustomValidity`, message ids into `aria-describedby`), + `use-previous.ts`. The
> hidden-native-input "bubble input" machinery ports surprisingly cleanly onto octane —
> the modern source is already IMPERATIVE (uncontrolled `defaultChecked` + native
> property setter + dispatched events). Documented octane adaptations: React's synthetic
> `isPropagationStopped()` → native `event.cancelBubble`; `defaultChecked`/`defaultValue`
> → the native `checked`/`value` ATTRIBUTES (HTML default-state semantics); an extra
> native `change` dispatched alongside the source's `click` (React forms observe checkbox
> clicks via synthetic onChange, octane's `<form onChange>` is the native event); Form's
> reset-on-edit handler is `onInput` in octane (React's `onChange` IS the input event —
> as native `onChange` it fired on the same event as the validate-on-change listener and
> stomped the fresh validity). Verified: 13 unit tests (FormData/reset/keyboard/validation)
> AND — because form controls are container-visible — **differential parity: FormControls
> across 5 click steps and Slider across keyboard steps, byte-identical vs real Radix**
> (real Radix's unguarded `useSize` needs a no-op ResizeObserver stub in jsdom).
>
> **FOUR more octane bugs found + fixed (#7–#10, all with regression tests + changesets):**
> (7) **`onInvalid` never fired** — `invalid` doesn't bubble; now capture-delegated WITH
> the focus/blur ancestor walk (React's onInvalid propagates: a form observes its
> controls' invalid events). Plus the `htmlFor` → `for` React-parity alias (compiler
> static templates, runtime dynamic/de-opt paths, SSR) — was a dead `htmlfor` attribute.
> (8) **Effect drains weren't re-entrancy-safe** — an effect dispatching a DISCRETE event
> (the bubble input's `click`) flushed from the handler and re-entered `drainPhase` over
> the same live queue, re-running executed entries; with a re-dispatching effect this
> recursed unboundedly (checkbox in `<form onChange>` → hundreds of change events + stack
> overflow). Drains now snapshot their batch up-front (React nulls
> rootWithPendingPassiveEffects first — same idea) (effect-dispatch.test.ts).
> (9) **Event-bundle optimization broke `this` for member callees** —
> `onClick={() => props.log.push(x)}` compiled to `{fn: props.log.push, args}` and the
> dispatcher's bare `fn(...)` ran the method with `this === undefined` (threw
> mid-dispatch). The old test only pinned the CODEGEN, never ran it. Bundling now
> requires a plain identifier callee (the hot path it was built for).
> (10) **De-opt patch path never removed dropped style keys** — `patchDeoptProps` reused
> the fresh-element applier whose style arm passes prev=undefined into setStyle, so a
> declaration absent from the next render's style object stayed on the reused element
> (Slider's thumb kept its pre-measurement `display: none` forever; caught by the
> differential). The patch path now threads the real previous style
> (deopt-style-patch.test.ts).
>
> **The final six + helpers (2026-07-03, parallel agent workflow):** `Menubar`,
> `Select` (the 1972-line giant: item-aligned + popper positioning, typeahead, hidden
> native bubble `<select>`), `NavigationMenu` (viewport/indicator machinery, motion
> attrs), `Toast` (viewport hotkey, timers with pause/resume, swipe machinery,
> announce regions), `OneTimePasswordField` (per-char cells, paste distribution,
> roving focus, hidden form input), `PasswordToggleField`, plus `AccessibleIcon`,
> `use-effect-event.ts` (insertion-effect sync), `use-is-hydrated.ts`
> (useSyncExternalStore). Each port ran port → adversarial fidelity review → fix as a
> 3-stage agent pipeline (15 agents); all unit suites green (Menubar 7, Select 9,
> NavigationMenu 10, Toast 8, OTP 8, PasswordToggle 6, AccessibleIcon 1).
>
> **FOUR more octane bugs (#11–#14), found via the ports, fixed with regression tests:**
> (11) `scroll`/`scrollend` never delegated (non-bubbling; now capture + target-only,
> React 17+ per-element semantics — Select's expand-on-scroll now uses the plain
> `onScroll` prop). (12) The de-opt reconciler destroyed foreign `createPortal` ranges
> inside octane-managed elements on the owner's re-render (Toast's viewport lost every
> toast; portal ranges are now tagged + skipped by reuse/removal/reorder — Toast's
> documented workaround removed). (13) An unkeyed `{cond ? <Comp/> : null}` de-opt item
> leaked the toggled-off component's DOM + effects forever (deoptItemBody's pure/Blocks
> paths now tear down each other's residue). (14) `memo()` was ignored at VALUE
> positions (childSlot lacked the bail componentSlot had) and the context-refresh walk
> missed array-children boundaries — fixed via a shared `tryMemoBail` + a childSlot
> forSlot arm; React's `['App','Consumer']` lazy propagation now holds in binding trees
> (memo-value-position.test.ts).
>
> **NavigationMenu convergence, resolved honestly:** the source relies on React's
> IMPLICIT same-element bailout to stop its unconditional register-effect cascade. The
> port expresses that explicitly (a `memo()` pass-through at the provider boundary —
> functional after fix #14) plus two documented residual adaptations (inlined
> ViewportContentMounter; a shallow-equal registration bail) where octane's subtree
> re-rendering + Presence interplay still oscillates. The implicit-bailout gap is now
> tracked in docs/react-parity-migration-plan.md Tier 2 with a concrete implementation
> path. `useResizeObserver` sites use `useEffectEvent` (insertion-effect sync) since
> octane's post-paint passives can expose one-render-stale `useCallbackRef` closures
> to layout effects.
>
> **Port coverage is now COMPLETE against the unified `radix-ui@1.6.1` surface** (every
> shipped component; `announce` is legacy/unshipped). Remaining: differential fixtures
> for the new inline-rendering components, SSR/hydration coverage, Phase-5 polish.

## 1. Recommendation

**Port Radix UI Primitives** (as `@octanejs/radix`, mirroring the unified `radix-ui` package's internal layering).

**Rationale (fit × value × effort):**

- **Best octane-fit of the three (score 8), no hard blockers.** Every pattern people fear when porting Radix — `forwardRef`, `composeRefs`, Popper positioning, `DismissableLayer`, `FocusScope` — is **already demonstrated working in the shipped `@octanejs/floating-ui` port**. `forwardRef` → `props.ref`; `composeRefs` → the ported `useMergeRefs` (`packages/floating-ui/src/useMergeRefs.ts`, a drop-in); a working `cloneElement`-over-`createElement` already exists locally at `packages/floating-ui/src/Composite.ts:32`. The load-bearing new work is one purpose-built `Slot`/`mergeProps`, and it has a proven in-repo reference.
- **Highest ecosystem value per unit effort.** Radix is the de-facto headless standard (shadcn/ui, dozens of design systems). Its state model is component-local (`useControllableState`, ~30 lines over `useState` + a ref) — no external store engine, no custom-host reconciler to reproduce.
- **Effort is Large but de-risked and incremental.** ~1–2 weeks for the shared foundation, then ~1–3 days per primitive; a genuinely useful subset (Dialog / Popover / Tooltip / DropdownMenu / Tabs / Accordion) ships ~1–2 weeks on top of the foundation. Nothing gates the *whole* library the way a runtime-capability prerequisite would.

**Why the other two lost:**

- **Base UI (score 6)** — loses on the `cloneElement` factor as a *runtime prerequisite*. Its single universal composition API is the element-form `render` prop, implemented with `React.cloneElement` inside `useRenderElement`, the one engine every one of its ~39 parts routes through. Octane has `createElement`/`ElementDescriptor` but no public clone-with-merged-props-and-refs — so **no part can be ported faithfully until that primitive exists**. The controlled-input divergence then hits its entire form family on top. Same floating-ui head start as Radix, but a heavier, more centralized mismatch.
- **React Aria (score 7)** — loses on a genuine design-project blocker. Its state hooks (react-stately) and prop-returning behavior hooks are a *strong* octane fit and largely `.ts`-authorable. But **react-aria-components' Collection API renders collection children through a React portal into a hand-written fake DOM (custom `Document`/`ElementNode`) and reads back an immutable collection** — depending on React's pluggable host-config reconciler. Octane's `createPortal` targets **real DOM only**; there is no custom-renderer seam. That gates every collection-backed component (ListBox, Select, Menu, Table, ComboBox, Tabs…) and is a redesign, not a port.

**The `@octanejs/floating-ui` head start decides it.** Radix's biggest external dependency (`@radix-ui/react-popper` = `@floating-ui/react-dom`) is not just covered — it's *over*-covered: the octane floating port already ships interactions, `FloatingFocusManager` (a `FocusScope` analogue with `aria-hidden`/`inert` `markOthers` + tabbable traps), `FloatingPortal`, and `useDismiss` (a `DismissableLayer` analogue). Radix consumes all of these.

## 2. Feasibility — the three hardest translation problems

**(a) `Slot` / `asChild` composition (the load-bearing new work).**
Radix's whole architecture is `asChild` + `Slot`: `Children.only` + `cloneElement` + `composeRefs` + `mergeProps`, projecting a part's behavior onto a user-supplied child. **These primitives now exist in octane** — `cloneElement`, `Children`, and `isValidElement` were added to the runtime (2026-07-01) with React byte-parity. The remaining Slot work is the richer *merge* layer (`mergeProps` + `composeEventHandlers` + ref/`className` merge) on top of them.
- *Octane primitives to use:* `createElement` + `ElementDescriptor` (runtime.ts:4235); private `isElementDescriptor` (runtime.ts:4279) to discriminate element-vs-function/text children; `attachRef`'s built-in multi-ref (`ref={[a,b]}`, runtime.ts:2611) / the ported `useMergeRefs` for ref merging; `normalizeClass` (runtime.ts:3211) for class composition.
- *Reference already in-repo:* `packages/floating-ui/src/Composite.ts:32-44` (`cloneElement`/`renderJsx` over `createElement`).
- *Prerequisite foundation work:* a **shared octane `Slot` + `mergeProps`** that (1) resolves the single slottable child from `children` using `isElementDescriptor` (needs a small `onlyChild`/`childrenToArray` descriptor walk — octane has none), (2) merges props with correct precedence, **chaining event handlers** (`composeEventHandlers`: call user handler, bail if `defaultPrevented`) under octane's native delegated `onXxx`/`onXxxCapture` model, (3) merges `className` via `normalizeClass` (**not** string concat — array `className` must yield `"a b"` not `"a,b"`), deep-merges `style`, and (4) threads a **merged ref** via `useMergeRefs`. Also port **`Slottable`** (Radix scans siblings for a marked child) using the same descriptor walk — the single fiddliest piece.

**(b) Cross-cutting behavior utilities (Presence, DismissableLayer, FocusScope, RovingFocus, Collection).**
Radix's components are thin; behavior lives in shared util packages.
- **Presence** → `useLayoutEffect` + native `animationend`/`transitionend` + `getComputedStyle` (no React internals). **DismissableLayer** / **FocusScope** → map onto `@octanejs/floating-ui`'s `useDismiss` and `FloatingFocusManager`. **RovingFocus/Collection** → map onto the ported `Composite`/`FloatingList` roving-tabindex + `useListItem`.
- `createContextScope`'s `__scope` threading → reimplemented as a factory returning octane `createContext` instances keyed by scope (API identical, internals rewritten). None missing at the primitive level.

**(c) Form primitives under octane's uncontrolled-input model.**

> **Reversal (2026-07-08):** octane now ships React-parity controlled components —
> `value`/`checked` reassertion on native events (`onInput` per keystroke; still no
> synthetic `onChange`). Form parts pass real controlled props directly; the
> imperative property-setting adaptation below is obsolete and its workaround
> machinery is being removed. Kept for the historical record.

Radix Checkbox/Switch/RadioGroup/Slider/Select render hidden native inputs and drive `checked`/`value` via React's controlled model + synthetic `onChange` + value re-assertion. Octane has **no controlled components and no synthetic `onChange`**.
- Component state → imperatively set the native property via `useLayoutEffect`+`ref`; read changes from native `onInput`/`onClick`. `useControllableState` stays as the *state* layer (unaffected — it's `useState`+ref, not a DOM concept).
- No runtime work needed; this is **re-authoring** state↔DOM binding per input-bearing part, not a line-for-line port. Biggest per-component risk area — schedule deliberately, cover with dedicated tests.

## 3. Phased migration plan

### Phase 0 — Foundation / prerequisites
- `Slot`, `Slottable`, `mergeProps`, `composeEventHandlers`, `composeRefs` (alias to `useMergeRefs`) — built on octane's now-public `cloneElement` / `Children` / `isValidElement` (added 2026-07-01); `className` merged via `normalizeClass`.
- `Primitive.<tag>` host wrapper with `asChild`.
- `useControllableState` (controlled/uncontrolled over `useState`+ref).
- `Presence` (exit-animation lifecycle over `useLayoutEffect` + `animationend`/`transitionend`).
- `createContextScope` (scope-keyed `createContext` factory).
- `Portal` → native `createPortal`; re-point `react-popper` → `@octanejs/floating-ui`.
- Wire the slot-threading convention (`splitSlot`/`subSlot`/`S('tag')`, per `packages/floating-ui/src/internal.ts`) for `.ts`-authored hooks.

*Exit criterion:* `Slot` passes a dedicated differential test proving props/`className`(→`"a b"`)/style/event-chaining/ref merge onto both a host element **and** a component child; `useControllableState` and `Presence` unit-tested.

### Phase 1 — First proof components
`Separator`, `Label`, `Accordion` (or `Collapsible`).
*Exit:* all three byte-equal in the differential rig across their event steps; `Accordion` exercises `useControllableState` + `Presence` + `asChild` end-to-end.

### Phase 2 — Expand: static + simple-state parts
`AspectRatio`, `VisuallyHidden`, `Avatar`, `Toggle`, `ToggleGroup`, `Progress`, `Tabs`, `Toolbar` (RovingFocus proof).
*Exit:* each in the rig; roving-tabindex focus nav covered by a dedicated focus test (rig can't see focus).

### Phase 3 — Overlays (leans hardest on `@octanejs/floating-ui`)
`Tooltip`, `HoverCard`, `Popover`, `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu`, `Menubar`. Reuse `FloatingFocusManager` (FocusScope), `useDismiss` (DismissableLayer), `FloatingPortal`. Port/replace `react-remove-scroll`/`aria-hidden` scroll-lock + focus-guards.
*Exit:* open/close/positioning parity in the rig; focus-trap, return-focus, dismiss covered by dedicated focus/interaction tests.

### Phase 4 — Hard components: form primitives + primitive-dense
`Checkbox`, `Switch`, `RadioGroup`, `Slider`, `Form` (re-authored to octane's native/uncontrolled model), then `Select`, `NavigationMenu` (Collection + RovingFocus + Popper + Presence + FocusScope simultaneously) **last**.
*Exit:* form parts match native behavior via `onInput`/`onClick` + attribute writes in the rig; document intentional divergences per the parity plan; `Select`/`NavigationMenu` pass rig + focus/keyboard tests.

### Phase 5 — Polish
`ScrollArea`, `Toast`, remaining primitives; SSR/hydration coverage; a changeset (patch track); README + intentional-divergence notes (esp. `className` composition and uncontrolled inputs).
*Exit:* `pnpm test`, `pnpm typecheck`, `pnpm format:check` green; hydration tests for overlay/portal components.

## 4. First milestone (smallest end-to-end proof)

**Ship `Separator`, `Label`, and `Accordion` on top of Phase 0.**

- **`Separator`** — pure host + `data-orientation`, no state. Proves `Primitive` + `asChild` (element and function forms) + `data-*`.
- **`Label`** — thin `Primitive` wrapper + `asChild` + native event pass-through. Proves `mergeProps`/event-chaining under native delegated events.
- **`Accordion`** — proves the real foundation: `useControllableState` (single/multiple, controlled + uncontrolled), `Presence` (CSS exit animation before unmount), `createContextScope`, `asChild` on triggers.

**Verification via the differential rig:** one `.tsrx` fixture per component, driven by `_rig.ts` so the **same fixture runs through octane and `@tsrx/react`**, asserting byte-equal `innerHTML` after each step (Separator: orientations + `asChild={<hr/>}`; Label: click/focus association; Accordion: toggle open/closed controlled + uncontrolled, asserting `data-state`). Because the rig compares final HTML only, **add a dedicated focus test** for Label's control association and a Presence timing test for Accordion.

## 5. Risks & open questions

- **`Slot`/`Slottable` correctness is the top risk** — projecting behavior onto an arbitrary child that may itself be a component descriptor requires correct prop precedence, event chaining, `style` deep-merge, ref merge, and `className` via `normalizeClass`. Mitigate with a dedicated Slot differential test in Phase 0 before any component depends on it.
- **`React.Children`/`cloneElement` gap. — RESOLVED (2026-07-01).** Octane's runtime now exports React-compatible **`cloneElement`, `Children` (`map`/`forEach`/`count`/`toArray`/`only`), and `isValidElement`** (`packages/octane/src/runtime.ts`, exported from `index.ts`), verified byte-for-byte against React via the differential rig (`tests/clone-children.test.ts` + `tests/differential/clone-children.test.ts`). The `Slot`/`Slottable` foundation builds directly on these instead of a binding-local walk. **Note for the binding:** these operate on element DESCRIPTORS — in `.tsrx`, prop-position JSX (`el={<button/>}`), `createElement`, array literals, and `.map()` returns are descriptors, but **children-position JSX compiles to a render function**. So octane's Slot/`asChild` should accept the element via a prop (the `@octanejs/floating-ui` `render`-prop convention) rather than Radix's children-position `<Trigger asChild><button/></Trigger>`, unless/until the compiler lowers single-element children to descriptors.
- **Form primitives (controlled-input divergence)** — re-authoring state↔DOM binding to native/uncontrolled inputs risks subtle gaps vs React. Mitigate with rig + explicit divergence notes per `docs/react-parity-migration-plan.md`; budget time in Phase 4.
- **Differential rig blind spots** — final-HTML only; can't catch focus-scope, effect-timing, or DOM-move regressions. Overlays (Phase 3) and Presence (Phase 1) must carry dedicated focus/timing tests.
- **Third-party deps needing porting:** `react-remove-scroll` / `react-remove-scroll-bar` / `aria-hidden` (Dialog/Popover scroll lock + focus guards). **Open question:** port these or replace with `@octanejs/floating-ui`'s `FloatingOverlay` + `markOthers`? Prefer reusing the floating-ui substrate.
- **`createContextScope` fidelity** — verify nested/composed scopes (Menubar → Menu → DropdownMenu) don't leak context.
- **Surface volume** — ~30 components + ~15–20 util packages; `forwardRef`→`props.ref` is mechanical but high-line-count. Sequence primitive-dense components (`Select`, `NavigationMenu`) last.

**Key source references:** `packages/octane/src/runtime.ts` (`createElement` 4235, `isElementDescriptor` 4279, `attachRef`/multi-ref 2611, `normalizeClass` 3211, `applyDeoptProps` 4765); `packages/floating-ui/src/Composite.ts:32-44` (local `cloneElement`/`renderJsx`); `packages/floating-ui/src/useMergeRefs.ts` (drop-in `composeRefs`); `packages/floating-ui/src/internal.ts` (`splitSlot`/`subSlot`/`S`); `packages/floating-ui/src/FloatingFocusManager.ts` + `useDismiss.ts` (FocusScope/DismissableLayer analogues).
