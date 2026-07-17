# React Aria → octane migration plan (`@octanejs/aria`)

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

### Phase 2 — Collections + selection (hooks tier)
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

*Exit:* differential ListBox/Menu/Tabs built from hooks with dynamic
collections; keyboard selection/typeahead behavior tests.

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
- **Static children-position JSX in collections** — octane compiles
  children-position JSX to render functions, so the **hooks-tier** legacy
  `CollectionBuilder` (which statically walks element descriptors) supports
  dynamic collections (`items` + render function returning `<Item>`
  descriptors) and descriptor arrays, but not literal static children. Same
  divergence class as radix `Slot` — document it. The **RAC tier** does NOT
  have this limitation (its engine renders the hidden copy, so render-function
  children work).
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
