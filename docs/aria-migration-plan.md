# React Aria → octane migration plan (`@octanejs/aria`)

> **Progress (2026-07-18): Phase 2 COMPLETE.** The collections + selection tier
> landed: the stately collections engine (`CollectionBuilder`/`Item`/`Section`/
> `getChildNodes`/`useCollection`) and selection core (`Selection`/
> `SelectionManager`/`useMultipleSelectionState`), the stately state hooks
> (`useListState`/`useSingleSelectListState`, `useTreeState`,
> `useMenuTriggerState`/`useSubmenuTriggerState`, `useOverlayTriggerState`,
> `useSelectState`, `useComboBoxState`, `useTabListState`, `useNumberFieldState`,
> `useSliderState`), the aria selection area (`useSelectableCollection`/`-Item`/
> `-List`, `useTypeSelect`, `ListKeyboardDelegate`, `DOMLayoutDelegate`), and the
> aria hooks `useListBox`/`useOption`/`useListBoxSection`, `useMenu`/`useMenuItem`/
> `useMenuSection`/`useMenuTrigger`/`useSubmenuTrigger`, `useTab`/`useTabList`/
> `useTabPanel`, `useSlider`/`useSliderThumb`, `useNumberField`, `useGridList`
> (+`Item`/`Section`/`SelectionCheckbox`), `useTag`/`useTagGroup`,
> `useBreadcrumbs`/`useBreadcrumbItem`. 131 tests in the aria project; the tabs and
> listbox collections run byte-identical vs real react-aria (dynamic collection +
> click selection). **Key finding:** with default tab selection established by
> `useTabListState`'s mount effect (not synchronously), react-aria's `useId` locks
> the tab panel's own id to the first render's value, so `panel.id` does NOT equal
> the selected tab's `aria-controls` in raw-hook usage — the octane port reproduces
> this exactly (`parity-collections.test.ts`). Static component-only collection
> children compile to positional descriptors (not a children block), so literal
> static collections work; the builder keeps a defensive `isChildrenBlock` guard.
> No octane-core changes were needed this phase.

> **Progress (2026-07-17, later): Phase 1 COMPLETE.** The focus area (FocusScope at
> full fidelity — scope tree, containment, restore, autoFocus, focus managers,
> tree walker — plus FocusRing/useFocusRing/useHasTabbableChild), the i18n area
> (I18nProvider + formatter/collator/filter hooks over verbatim
> `@internationalized/*`), the form-validation layer, the remaining utils, the
> stately state hooks (toggle/toggle-group/checkbox-group/radio-group/
> searchfield/disclosure/form), and ALL Phase-1 leaf hooks (button family, label/
> field, checkbox family, radio family, switch, textfield, searchfield with its
> verbatim intl dictionaries, progress, meter, separator, link, disclosure,
> toolbar, VisuallyHidden). 73 tests in the aria project; leaf differentials
> byte-identical vs real react-aria (button/span-button/toggle-button/checkbox/
> switch/radio-group/textfield/progress). The onChange→onInput wiring held
> everywhere with one refinement: useToggle's label preventDefault is scoped to
> non-input targets (upstream's unconditional preventDefault relies on React's
> synthetic onChange firing anyway; under native events it would cancel the
> input's own activation for virtual clicks).
> **Second octane bug found + fixed:** a `flushSync` commit inside a controlled
> checkable's click dispatch (press-state machinery) reasserted the stale
> controlled `checked` over the platform's in-flight toggle — the activation's
> `input`/`change` events fire AFTER the click, so native handlers read a
> reverted DOM. During the activation window the checked binding now uses
> React's prop-diff (not DOM-diff) semantics; the rejection contract is
> unchanged (octane `checkable-activation-commit.test.ts`, changeset added).

> **Progress (2026-07-17): Phase 0 COMPLETE.** Utils foundation + the FULL interactions
> area landed (usePress at token-level fidelity incl. pointer capture, virtual
> clicks, keyboard/link paths, meta-key replay, iOS fallbacks; useHover,
> useFocus/-Within/-Visible, useKeyboard with the Proxy-based `BaseEvent` wrapper
> over native events, useLongPress, useMove, useInteractOutside, useScrollWheel,
> useFocusable/Focusable, Pressable/PressResponder), plus `useControlledState`
> under `/stately`. **Differential parity GREEN (5 fixtures)**: press sequence,
> hover, focus-within, keyboard stop-by-default/continuePropagation, and
> mergeIds convergence run byte-identical vs real react-aria. Two rig lessons for
> later phases: the two live copies share ONE document, so (a) press gestures need
> distinct pointerIds per side (usePress's document-global listeners filter on
> it), (b) hover fixtures must dispatch each renderer's own native delivery form
> in cross-safe order (a hovered useHover attaches a document-capture pointerover
> listener that ends hover on outside pointerovers), and (c) focus fixtures
> dispatch synthetic focus/focusin pairs — real `.focus()` fights over the single
> document's focus. 69 tests green in the aria project.
> (`packages/aria`, vitest `aria` project, pinned `.react-spectrum/` checkout at
> `1c84a49a`). Foundation utils ported (chain/mergeProps/mergeRefs/useId+mergeIds/
> useObjectRef/useSyncRef/useGlobalListeners/useEvent/useEffectEvent/useValueEffect/
> SSRProvider) with the subSlot manual-slot convention; public hooks keep upstream
> typing via overload declarations over a `(...args)`+`splitSlot` implementation.
> **First octane bug found + fixed (the point of the exercise):** the compiler
> claimed any call spelled like a builtin hook as octane's builtin even when the
> name was bound by an import from another module — `import { useId } from
> '@octanejs/aria'` got a colliding octane `useId` runtime import injected
> (duplicate-identifier parse error; wrong callee). Non-octane import bindings now
> shadow the builtin spelling in hook slotting, the JS-loop guard, and the
> `useState` third-tuple getter analysis (regression: octane
> `foreign-hook-names.test.ts`, changeset added).
> **Both §2(a) collection-engine spikes PASSED with no octane changes** (pinned in
> `packages/aria/tests/collection-host-spikes.test.ts`): (1) the same children
> render function mounts at two positions with independent DOM + shared reactive
> updates — including the exact hidden-detached-copy + live-copy shape; (2)
> `createPortal` into a detached, never-attached container renders, updates,
> preserves keyed node identity across reorder, and tears down cleanly. The
> Phase-4 detached-real-DOM collection host is GO as designed.

Faithful port of **React Aria** (Adobe's accessibility-first behavior library, from
the `adobe/react-spectrum` monorepo) to the octane renderer, mirroring the
`@octanejs/radix` / `@octanejs/base-ui` methodology: port from pinned upstream
TypeScript source, prove parity with the **differential rig** (the SAME `.tsrx`
fixture through `@octanejs/aria` and the real React packages via `@tsrx/react`,
byte-equal `innerHTML` per step), and follow the standing discipline — **when a
faithful port can't reproduce React behavior, fix octane with a regression test +
changeset; never work around it in the binding.**

**Pinned upstream:** `react-aria@3.50.0`, `react-stately@3.48.0`,
`react-aria-components@1.19.0` — all three published from `adobe/react-spectrum`
commit **`1c84a49a1faf50b571c84e00bcf9c60b22ddd03e`**. Port from a gitignored
checkout at that commit (`.react-spectrum/`, mirroring the `.radix-primitives/`
convention): `git clone https://github.com/adobe/react-spectrum .react-spectrum
&& git -C .react-spectrum checkout 1c84a49a`. Sources live in
`packages/@react-aria/*/src`, `packages/@react-stately/*/src`, and
`packages/react-aria-components/src`; new-port file headers cite those paths.

## 1. Scope and package shape

React Aria is three layers, and since the 2025 consolidation the npm surface is
**flat monopackages** (the scoped `@react-aria/*` / `@react-stately/*` packages
are now thin re-export shims over them):

1. **`react-stately`** (~40 state hooks) — DOM-free state management
   (`useToggleState`, `useListState`, `useSelectState`, `useComboBoxState`,
   `useCalendarState`, the selection engine, `useListData`/`useTreeData`/
   `useAsyncList`, Color state).
2. **`react-aria`** (~90 behavior hooks + a few components) — hooks that take
   state + a ref and return DOM prop bags (`useButton`, `usePress`, `useHover`,
   `useListBox`, `useSelect`, `useOverlayPosition`, …) plus `FocusScope`,
   `FocusRing`, `Overlay`, `Pressable`, `Focusable`, `VisuallyHidden`,
   `I18nProvider`, SSR utilities, and the new `Collection`/`CollectionBuilder`
   engine.
3. **`react-aria-components`** (RAC, ~60 components) — the styled-by-you
   component layer over the hooks, with render props, slot contexts, and
   `data-*` state attributes.

**`@octanejs/aria` is ONE workspace package** (`packages/aria/`) mirroring that
consolidation, with three entry points:

- `@octanejs/aria` → the `react-aria` hook surface,
- `@octanejs/aria/stately` → the `react-stately` surface,
- `@octanejs/aria/components` → the `react-aria-components` surface.

Internal layout mirrors the monopackage build's area layering
(`src/interactions/`, `src/focus/`, `src/overlays/`, `src/collections/`,
`src/listbox/`, …, `src/stately/*`, `src/components/*`) so upstream diffs stay
mappable.

**Consumed verbatim as npm deps (no port):** `@internationalized/date`,
`@internationalized/number`, `@internationalized/string` (framework-free — the
entire date/number engine), `@react-types/shared` (types only), `clsx`. The
compiled intl message dictionaries (JSON) that ship beside each area are copied
from the pinned checkout and consumed verbatim through the ported
`useLocalizedStringFormatter`.

## 2. Feasibility — the four hardest translation problems

### (a) The collection engine (the historical blocker — now tractable)

The radix-era assessment scored React Aria down because RAC's collection API
"renders collection children through a React portal into a hand-written fake
DOM". That is still true in 3.50 (now in react-aria core,
`dist/private/collections/`), but reading the current source shows the problem
is **narrower than the original assessment assumed**:

- `CollectionBuilder` renders a **hidden copy** of the collection children
  (client: inside a real `<template>` element; the `Hidden` component) with a
  `CollectionDocumentContext` carrying a mutable fake `Document`.
- `CollectionRoot` then `createPortal`s the children **into that fake
  `Document`** — React DOM's host config drives `createElement`/`appendChild`/
  `insertBefore` against the fake nodes.
- Critically, the hidden tree contains **only structural elements** — the
  `createLeafComponent`/`createBranchComponent` wrappers render bare
  `<item>`/`<section>`-style placeholder elements with a ref. The user-visible
  JSX is NOT rendered there: it's cached on the node as `rendered`/`render`
  props and rendered later, in the real tree, from the built collection.
- The fake `Document` batches mutations and vends immutable `BaseCollection`
  snapshots through `useSyncExternalStore`.
- SSR takes a different path entirely: `SSRContext` creates fake-document
  elements **during render, in order** (render-phase side effects, guarded
  against double render).

Octane's compiled templates clone real `<template>` HTML — a portal into a fake
document can never receive octane's DOM writes. But because the hidden tree is
just a flat/shallow tree of placeholder elements, octane can build the same
collection with **real detached DOM instead of fake DOM**:

- Render the hidden structural copy into a **detached real container** (octane
  `createPortal` to an unparented element — portals-at-any-position landed
  2026-07). `<item>`/`<section>` placeholder tags are valid real DOM
  (`HTMLUnknownElement`); render them with refs.
- Refs register each element's `(NodeClass, props, rendered, render)` into a
  binding-owned `Document` store via a `WeakMap<Element, CollectionNode>`; every
  item commit marks the store dirty (upstream's `setProps` →
  `updateCollection` → notify, same cadence).
- On snapshot, rebuild by **walking the detached container's real DOM** —
  document order is the source of truth, which is exactly what upstream's fake
  node tree encodes. `BaseCollection` itself ports near-verbatim.
- `useSyncExternalStore` (octane has it) delivers immutable snapshots to
  `CollectionInner` unchanged.
- SSR mirrors upstream's own SSR design: in-order render-phase registration
  under the octane server runtime (single-pass, ordered — octane SSR is).

The considered alternative — driving the collection through octane's
**universal renderer seam** (`docs/universal-renderer-architecture.md`; the
object driver already proves create/insert/move/remove against non-DOM hosts) —
is architecturally cleaner but heavier: universal is a per-file compile target
with its own intrinsics catalogue, and the hidden tree would put every RAC
component file on the universal branch. Start with the detached-real-DOM host;
revisit universal only if the real-DOM walk shows a correctness gap the seam
solves (this is a binding-internal engine — swapping it later is invisible to
consumers).

**Phase-0 spike (gates Phase 4):** (1) the same `children` render function
mounted at two positions simultaneously (hidden structural copy + real tree) —
validate octane's semantics or find the divergence to fix in octane; (2) octane
`createPortal` into a detached, never-attached container — render, update,
reorder, teardown.

### (b) Returned prop bags under octane's native event model

React Aria hooks return props typed against React's synthetic events, and the
library leans on React event details in known places:

- **`onChange` on text inputs** — octane has no synthetic `onChange`; per repo
  policy the DOM wiring flips to `onInput` (per-keystroke, same as React's
  onChange for text). React Aria's **public** `onChange(value)` API is a
  value-level callback, not a DOM handler, so the ported surface is unchanged —
  this is the `@octanejs/hook-form` precedent. Checkbox/radio/switch toggles
  fire native `input` too, so the same wiring covers toggles.
- **`onFocus`/`onBlur` bubbling** — React delegates focus as `focusin`; octane
  capture-delegates focus/blur with the ancestor walk (landed during the radix
  port). Parity already holds.
- **Enter/leave events** target-only, **`event.currentTarget`** per-handler —
  both fixed in octane during the radix port.
- **`continuePropagation()`** — react-aria wraps keyboard/press events in its
  own `BaseEvent` (`createEventHandler`) where propagation is stopped by
  default and `continuePropagation()` opts out. That wrapper is library code
  over a plain event object; it ports verbatim onto native events.
- **`usePress`** (the ~1300-line heart of the library) mixes prop-position
  handlers with global `document` listeners and pointer capture — all native
  APIs; the radix Slider/pointer-capture port is precedent.
- `ReactDOM.flushSync` → octane `flushSync`; `react-dom` `createPortal` →
  octane `createPortal`; `useSyncExternalStore` → octane's; `forwardRef` →
  ref-as-prop (mechanical, high-line-count); `useObjectRef`/`mergeRefs` port
  onto octane's multi-ref support.

### (c) Overlays: self-contained — port verbatim, do NOT re-point at floating-ui

Unlike Radix (whose Popper IS `@floating-ui/react-dom`, so re-pointing at
`@octanejs/floating-ui` was the faithful move), React Aria ships its **own**
positioning engine (`calculatePosition`, ~800 lines of pure DOM math), its own
`FocusScope`, `ariaHideOutside`, `usePreventScroll`, and `Overlay` portal
system. The faithful port keeps all of it — byte-parity output
(`style`/`aria-*` attributes) depends on Adobe's exact math and attribute
choices, and the base-ui port already proved that reusing a sibling substrate
breaks parity (`data-base-ui-*` vs `data-floating-ui-*`). No dependency on
`@octanejs/floating-ui`.

### (d) Scale

This is the largest binding yet — roughly **3–4× the Radix surface** (~90 aria
hooks + ~40 stately hooks + ~60 RAC components + DnD + Virtualizer + the
date/color families). Mitigations: the layering is unusually clean (stately has
zero DOM; hooks depend only on utils/interactions/i18n; RAC is a consumer of
both); the phase gates below each ship a coherent, independently useful
surface; and the radix "final six" 3-stage agent pipeline
(port → adversarial fidelity review → fix) is the proven way to parallelize the
long tail. Sequence `Table`, DnD, and `Virtualizer` last — they are the
densest and least-demanded.

## 3. Phased migration plan

### Phase 0 — Scaffold + utils + interactions core
- `packages/aria/` scaffold on the radix template: `package.json` (with
  `octane.hookSlots.manual: ["src"]`), `tsconfig.json`, `status.json`, vitest
  project + differential `_setup.ts` (rewrites `@octanejs/aria` →
  `react-aria`, `/stately` → `react-stately`, `/components` →
  `react-aria-components` for the React side), catalog entries for the pinned
  upstream packages, `.react-spectrum/` checkout + gitignore entry.
- Utils: `mergeProps`, `chain`, `mergeRefs`, `useObjectRef`, `filterDOMProps`,
  `useSyncRef`, `useId`/`mergeIds` (over octane `useId`), `useLayoutEffect`
  shim, `useEffectEvent`, scroll/platform/runAfterTransition helpers;
  `@react-aria/ssr` (`useIsSSR`); `@react-stately/utils`
  (`useControlledState`).
- Interactions: `usePress` + `Pressable`/`PressResponder`, `useHover`,
  `useFocus`, `useFocusWithin`, `useFocusVisible`, `useKeyboard`,
  `useLongPress`, `useMove`, `useInteractOutside`, `Focusable`, `focusSafely`,
  text-selection.
- **The two collection-engine spikes from §2(a).**

*Exit:* differential fixtures surfacing press/hover/focus-visible state as
attributes, byte-equal vs real react-aria; dedicated focus/pointer behavior
tests (rig is HTML-only); spike findings written back into this doc.

### Phase 1 — Focus + leaf hooks + i18n
- `FocusScope`, `FocusRing`, `useFocusRing`, `useFocusManager`,
  `useHasTabbableChild`.
- Leaf hooks + their stately state: `useButton`, `useToggleButton`(+Group),
  `useLabel`/`useField`, `useTextField`, `useSearchField`, `useCheckbox`
  (+Group), `useRadioGroup`, `useSwitch`, `useProgressBar`, `useMeter`,
  `useSeparator`, `useLink`, `useDisclosure`(+Group), `useToolbar`,
  `VisuallyHidden`.
- i18n: `I18nProvider`, `useLocale`, `useCollator`, `useDateFormatter`,
  `useNumberFormatter`, `useListFormatter`, `useFilter`,
  `useLocalizedStringFormatter` + verbatim message dictionaries.

*Exit:* differential button/toggle/checkbox/radio/switch/textfield fixtures
(hook-level: fixtures spread the returned prop bags onto host elements
identically on both sides); FocusScope trap/restore behavior tests.

### Phase 2 — Collections + selection (hooks tier) — COMPLETE (2026-07-18)
- Stately: the selection engine (`SelectionManager`,
  `useMultipleSelectionState`), legacy JSX collection building (`Item`,
  `Section`, `CollectionBuilder` — walks element **descriptors**; see
  divergence note below), `useListState`, `useSingleSelectListState`,
  `useTreeState`, `useMenuTriggerState`, `useSelectState`, `useComboBoxState`,
  `useTabListState`, `useNumberFieldState`, `useSliderState`.
- Aria: `useSelectableCollection`/`List`/`Item`, `useTypeSelect`,
  `ListKeyboardDelegate`, `useListBox`/`useOption`/`useListBoxSection`,
  `useMenu`/`useMenuItem`/`useMenuTrigger`/`useMenuSection`/`useSubmenuTrigger`,
  `useTabList`/`useTab`/`useTabPanel`, `useGridList`, `useTagGroup`,
  `useBreadcrumbs`, `useNumberField`, `useSlider`/`useSliderThumb`.

*Exit (met):* differential Tabs + ListBox built from hooks with dynamic
collections, byte-identical vs real react-aria (`parity-collections.test.ts`);
Menu/Tabs/ListBox roles, roving tabIndex, and click selection covered by
behavioral tests (`listbox-menu-tabs.test.ts`); slider/numberfield/gridlist/tag/
breadcrumbs aria wiring covered by `slider-numberfield-gridlist.test.ts`;
keyboard selection/typeahead by `selectable-collection.test.ts`. (Menu's overlay
open path isn't rig-driveable — focus can't be driven across the shared
document — so it stays on behavioral coverage, matching the leaf-differential
precedent.)

### Phase 3 — Overlays (hooks tier)
- Stately overlays (`useOverlayTriggerState`, `useTooltipTriggerState`) +
  the whole `@react-aria/overlays` area: `Overlay`/`PortalProvider`,
  `useOverlay`, `useOverlayTrigger`, `useOverlayPosition`
  (`calculatePosition` verbatim), `useModal`/`ModalProvider`,
  `useModalOverlay`, `usePopover`, `usePreventScroll`, `ariaHideOutside`,
  `DismissButton`.
- Consumers: `useDialog`, `useTooltipTrigger`, `useSelect` + `HiddenSelect`,
  `useComboBox`, `useAutocomplete`.

*Exit:* differential Select/ComboBox/Dialog/Tooltip hook-level fixtures (open
state, portal'd ARIA wiring); focus-trap/dismiss/scroll-lock behavior tests.

### Phase 4 — RAC foundation (`@octanejs/aria/components`)
- **The collection host** from §2(a): `BaseCollection` port, the detached
  real-DOM `Document` store, `CollectionBuilder`/`createLeafComponent`/
  `createBranchComponent`, `Hidden`, `useCachedChildren`, SSR registration
  path.
- RAC plumbing: `Provider`, `useContextProps`, slot contexts +
  `useSlottedContext`, `useRenderProps` (className/style/children render props
  + `data-*` state attributes).
- Non-collection components: `Button`, `ToggleButton`(+Group), `Checkbox`
  (+Group), `Switch`, `RadioGroup`, `TextField`, `SearchField`, `NumberField`,
  `Form`, `Label`/`Input`/`TextArea`/`FieldError`, `Group`, `Toolbar`,
  `Separator`, `Link`, `ProgressBar`, `Meter`, `Slider`, `Switch`,
  `Disclosure`(+Group), `Dialog`/`Modal`/`Popover`/`Tooltip` (overlay parts).

*Exit:* RAC's `data-hovered`/`data-pressed`/`data-focus-visible` attributes
make interaction state VISIBLE to the HTML-only rig — differential fixtures
click/hover/focus through the real components on both sides, byte-equal.

### Phase 5 — RAC collection components
`Menu`, `ListBox`, `Select`, `ComboBox`, `Autocomplete`, `Tabs`, `TagGroup`,
`GridList`, `Breadcrumbs`, `Tree`, and **`Table` last** (the densest: column
resizing, sort, selection, drag). Each: differential fixture + keyboard/focus
behavior tests.

### Phase 6 — Date/time + color families
Stately calendar/date/color state + aria `useCalendar`/`useRangeCalendar`,
`useDateField`/`useTimeField`, `useDatePicker`/`useDateRangePicker`, the color
hooks, then RAC `Calendar`/`RangeCalendar`/`DateField`/`DatePicker`/
`DateRangePicker`/`TimeField` and the `ColorPicker` family. The math is all in
verbatim `@internationalized/date` — this family is broad but mechanical.

### Phase 7 — Advanced subsystems (demand-driven order)
- **Drag & drop**: `useDrag`/`useDrop`, draggable/droppable collections, RAC
  `DropZone`/`FileTrigger` + collection DnD wiring.
- **Virtualizer**: `@react-stately/virtualizer` + RAC `Virtualizer` + layouts.
- **Toast**: `useToastState`, `useToast`, RAC toast components.
- `useLandmark`, `aria-modal-polyfill` (`watchModals`) — port on demand.

### Phase 8 — Polish
SSR/hydration coverage for overlay + collection components (including the
SSR collection-registration path), `status.json` finalization +
`pnpm bindings:status`, README with divergence notes, changeset (patch track),
`docs/bindings-status.md` regeneration.

## 4. First milestone (smallest end-to-end proof)

**Phase 0 + `useButton`/`useSwitch`/`useTextField` differential-verified.**
This exercises the risk core — `usePress` (the biggest single file in the
library), hover/focus-visible, `mergeProps`/`filterDOMProps`, `useControlledState`,
the `onChange`→`onInput` wiring, and label/field ARIA plumbing — with zero
collection or overlay dependency. If prop-bag fixtures come out byte-equal here,
the whole hooks tier follows the same pattern.

## 5. Verification strategy

- **Differential rig** (radix convention): `packages/aria/tests/differential/`
  with a `_setup.ts` precompile that rewrites the three entry points to the
  real React packages. Hook-tier fixtures spread returned prop bags onto
  identical host markup; RAC-tier fixtures render the real components. The
  rig's `useId` canonicalisation already handles React token formats; extend
  the pattern set for `react-aria-*`-prefixed ids if needed.
- **RAC is unusually rig-friendly**: interaction state surfaces as `data-*`
  attributes and render-prop class names — hover/press/focus-visible/selection
  become byte-visible in `innerHTML`, which the radix port never had.
- **Known rig blind spots** (focus targets, effect timing, DOM moves) get
  dedicated behavior tests per phase: FocusScope trap/restore, typeahead,
  roving `tabIndex`, dismiss ordering, `usePreventScroll` side effects.
- **jsdom gaps**: pointer-capture, `getBoundingClientRect` zeros, and
  ResizeObserver stubs follow the patterns already established in the radix
  Slider/ScrollArea and tanstack-virtual ports.
- Full gates before any hand-off: `pnpm test`, `pnpm typecheck`,
  `pnpm format:check`.

## 6. Risks & open questions

- **The two-mount children spike** (§2(a)) is the load-bearing unknown for
  Phase 4. If octane can't render the same children function at two positions,
  that's an octane fix (portal/render-scope semantics), not a binding
  workaround — budget for it before RAC work starts.
- **Static children-position JSX in collections** — RESOLVED narrower than
  planned (Phase 2, verified by `collections-engine.test.ts`): component-only
  children (`<Item>`/`<Section>`) compile to positional DESCRIPTORS, not a
  children block, so the hooks-tier `CollectionBuilder` walks literal static
  children too — single and multiple. Dynamic collections (`items` + render
  function) and descriptor arrays work as planned. The builder keeps a
  defensive `isChildrenBlock` guard with a descriptive error for any
  block-forming children shape (mixed host/text content). The **RAC tier**
  additionally renders the hidden copy, so render-function children work.
- **Render-phase side effects in the SSR collection path** — upstream relies
  on single-pass, in-order SSR rendering. Octane SSR is single-pass, but the
  parallel-`use()` batching and streaming re-registration behavior
  (`puMemo`/`warmMemo`) must be checked against collection building inside
  suspended subtrees.
- **`usePress` fidelity** is the highest-leverage single file: virtual
  clicks, pointer capture, iOS quirks, text-selection suppression. Its tests
  upstream are extensive — port a meaningful subset as behavior tests.
- **Intl string volume** — ~30 locales × ~40 areas of JSON dictionaries.
  Copy verbatim from the pinned checkout; do NOT hand-edit; keep the layout
  mirroring upstream so refreshes are mechanical.
- **`useId` format** — react-aria's ids derive from React `useId` with a
  `react-aria` prefix; octane's `useId` is hydration-stable but differently
  shaped. The rig canonicalises; SSR/hydration tests must assert REFERENCE
  consistency (`aria-labelledby` ↔ `id`), not literal values.
- **Expected octane parity bugs**: every prior port of this scale surfaced
  real octane bugs (radix found 14). Finding them is the point of the
  exercise — budget review/fix time per phase, each with a regression test +
  changeset in core.
- **Package-shape question, resolved here**: one package, three entry points
  (mirrors upstream's own monopackage direction; keeps `status.json`/
  bindings-status tracking per-package like every other binding). Granular
  scoped-package shims are out of scope.
