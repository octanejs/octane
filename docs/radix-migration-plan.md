# Octane UI-Library Port Plan: Radix UI Primitives

> Recommendation + phased plan from a research pass that evaluated **Base UI**, **Radix UI**,
> and **React Aria** against octane's actual runtime/compiler source and the existing
> `@octanejs/floating-ui` port. Radix won on fit × value × effort.
>
> **Progress (2026-07-01):** `@octanejs/radix` — **Phase 0 foundation + Phase 1 stateful
> components** landed. Foundation: `Slot`/`Slottable`, `Primitive.<tag>` (`asChild`),
> `mergeProps`, `composeRefs`/`useComposedRefs`, `composeEventHandlers`, `useControllableState`,
> `Presence`. Components: `Separator`, `Label`, `Collapsible`, `Accordion` (single + multiple).
> Unit-tested (mount, 10 tests). This surfaced + fixed an **octane parity bug**: `aria-*`
> attributes are enumerated, so `aria-expanded={false}` now renders `"false"` (not removed) —
> fixed in `setAttribute`/`ssrAttr`.
>
> **Deferred:** `createContextScope` scope-isolation (using plain octane context for now);
> `Collapsible.Content`'s CSS-var height + `Presence`-based exit-animation defer (the double-
> state `ContentImpl` didn't settle in octane's effect model — Content gates on `open` for
> now; `Presence` itself is validated standalone); Accordion arrow-key roving focus
> (RovingFocusGroup — a separate reusable primitive); `Portal` (Phase 3); and a
> differential-vs-real-`@radix-ui` harness (needs `@radix-ui/*` in the catalog).

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
