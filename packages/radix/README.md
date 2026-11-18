# @octanejs/radix

[Radix UI Primitives](https://www.radix-ui.com/primitives) for the
[octane](https://github.com/octanejs/octane) UI framework — a port of
[`@radix-ui/react`](https://www.npmjs.com/org/radix-ui) (headless, accessible UI
primitives) on octane's hooks. It mirrors the unified `radix-ui` package's shape: the
low-level composition utilities are exported directly, and each component is a namespace
(`Separator.Root`, `Label.Root`).

## Installation

```sh
npm install @octanejs/radix
pnpm add @octanejs/radix
```

```tsx
import { Separator, Label } from '@octanejs/radix';

function Field() {
  return (
    <div>
      <Label.Root class="label">Email</Label.Root>
      <Separator.Root orientation="horizontal" />
    </div>
  );
}
```

## How it works

The React binding layer maps onto octane cleanly: `forwardRef` → octane's ref-as-prop,
`composeRefs` → `composeRefs`/`useComposedRefs`, and Radix's `Slot`/`asChild`
(`Children.only` + `cloneElement` + prop/ref merge) → octane's runtime `Children` /
`cloneElement` / `isValidElement`. Popper/focus/dismiss behavior reuses the already-ported
[`@octanejs/floating-ui`](../floating-ui). See
[`docs/radix-migration-plan.md`](../../docs/radix-migration-plan.md) for the full plan.

### `asChild` takes a descriptor

`Slot`/`asChild` operate on element **descriptors**. In `.tsrx`/`.tsx`, prop-position JSX
(`el={<button/>}`), `createElement`, and `.map()` returns are descriptors, but
children-position JSX compiles to a render function. So an octane `asChild` consumer passes
the child element at a value/prop position (or via `createElement`) rather than React's
children-position `<Trigger asChild><button/></Trigger>`.

## Status

**Surface-present against the unified `radix-ui@1.6.4` component exports.** Landed:

- Composition foundation — `Slot`, `Slottable`, `Primitive.<tag>` (`asChild`), `mergeProps`
  (event chaining, `style` merge, clsx-style `class` composition), `composeRefs` /
  `useComposedRefs`, `composeEventHandlers`.
- State foundation — `useControllableState` (controlled/uncontrolled), `Presence` (keeps a
  child mounted through its CSS exit animation), the full **`createContextScope`**
  (`createScope` + `composeContextScopes`) so composed primitives can't collide,
  `createCollection` (the Collection primitive: `data-radix-collection-item` stamping +
  DOM-ordered item registry), the `radix-`-prefixed `useId`, `useCallbackRef`,
  `Direction` (`useDirection`/`Provider`), and `useSize`.
- Components — `Separator`, `Label`, `Collapsible`, `Accordion` (single + multiple, full
  keyboard nav), **`Dialog`** (modal + non-modal), **`AlertDialog`**, **`Toggle`**,
  **`ToggleGroup`**, **`Tabs`**, **`Toolbar`** (roving focus + embedded ToggleGroup),
  `AspectRatio`, `VisuallyHidden`, `Avatar` (image loading state machine), `Progress`,
  `Arrow` — the roving-focus family on the full **`RovingFocusGroup`** port.
- **The Popper overlay family** — **`Popper`** (anchor/content/arrow on
  `@octanejs/floating-ui`'s positioning core: offset/shift/flip/size/arrow/hide +
  transform-origin middleware, `--radix-popper-*` CSS vars, virtual anchors),
  **`Tooltip`** (provider delays, skip-delay, grace-area convex hull, hidden a11y copy),
  **`Popover`** (modal + non-modal, custom Anchor), **`HoverCard`** (open/close delays,
  selection containment), the shared **`Menu`** primitive (typeahead, checkbox/radio
  items + indicators, submenus with pointer-grace polygons), **`DropdownMenu`**, and
  **`ContextMenu`** (right-click / long-press virtual anchor).
- **`ScrollArea`** — custom scrollbars over a native scroll viewport: all four
  visibility strategies (`hover` / `scroll` state machine / `auto` overflow
  measurement / `always`), thumb drag + wheel scroll geometry, corner, and the
  scroll-linked-effect-avoiding rAF thumb loop.
- **The form batch** — **`Checkbox`** (indeterminate), **`Switch`**,
  **`RadioGroup`** (roving-focus arrow keys check items), **`Slider`**
  (multi-thumb, keyboard + pointer-capture sliding), and **`Form`** (native
  Constraint Validation: built-in + custom sync/async matchers, messages wired
  into `aria-describedby`). Each control renders Radix's hidden native "bubble
  input" inside forms, so FormData, form reset, and `<form onChange>` reflect
  state natively (see the per-file headers for the documented octane
  adaptations around the uncontrolled-input model).
- **The final six** — **`Menubar`** (menu family over the shared Menu primitive),
  **`Select`** (item-aligned + popper positioning, typeahead, hidden native bubble
  `<select>`), **`NavigationMenu`** (viewport/indicator machinery, motion attributes,
  delayed open/close), **`Toast`** (viewport hotkey, pausable timers, swipe machinery,
  announce regions), **`OneTimePasswordField`** (per-char cells, paste distribution,
  roving focus), and **`PasswordToggleField`** — plus `AccessibleIcon`,
  `useEffectEvent`, and `useIsHydrated`.
- Overlay infra — `Portal`, `DismissableLayer`, `FocusScope`, `useFocusGuards`,
  `useScrollLock` (a focused `react-remove-scroll` replacement — see `scroll-lock.ts`),
  with the framework-agnostic `aria-hidden` package reused as-is.

**Bounded evidence against real Radix**: the differential suite
(`tests/differential/parity.test.ts`) runs the SAME fixture through `@octanejs/radix` and
the real `radix-ui` package on React, asserting byte-identical DOM after every interaction
step; portal'd overlays (which the rig can't see) carry dedicated focus/keyboard/dismiss
unit suites. The exact transitive source and test boundary is authenticated in
[`UPSTREAM.md`](./UPSTREAM.md). The 16-case differential is not exhaustive verification of the
complete canonical suite, so status remains `recorded-unverified`.

Remaining (documented in
[`docs/radix-migration-plan.md`](../../docs/radix-migration-plan.md)): SSR/hydration
coverage for the overlay/portal components and Phase-5 polish. The port surfaced —
and fixed, in octane itself — fourteen runtime/compiler parity bugs along the way;
each is pinned by an octane regression test and a changeset.

## Escape across React and Octane dialogs

React Radix and this port maintain separate dismissable-layer stacks. For nested,
in-place dialogs that cross `OctaneCompat` or `ReactCompat`, opt each participating
React `Dialog.Content` into the cooperative Escape bridge:

```tsx
import { createEscapeLayerBridge } from '@octanejs/radix';
import { useMemo } from 'react';

function MixedContent({ onEscapeKeyDown, ...props }) {
  const escapeLayer = useMemo(createEscapeLayerBridge, []);
  return (
    <ReactDialog.Content
      {...props}
      ref={escapeLayer.ref}
      onEscapeKeyDown={(event) => escapeLayer.onEscapeKeyDown(event, onEscapeKeyDown)}
    />
  );
}
```

Compose `escapeLayer.ref` with an existing content ref if needed. Native dialogs
join automatically while a React content ref is registered. For supported mixed ordering,
the top dialog receives the original cancelable Escape event once; `preventDefault()`
vetoes dismissal, and ordinary keyboard propagation continues. If a React parent's capture
listener runs first, it routes the native child's callback immediately, so ordering relative
to independent document capture listeners can differ.

This opt-in supports cancelable Dialog Escape events with a native dismissal action
and nested in-place content. React retains its own ordering between React layers. If its
private stack chooses a React parent while a native layer separates it from the top React
layer, the bridge suppresses that parent rather than dismissing the mixed subtree; that
topology requires additional cooperation to dismiss. The bridge does not establish ordering
for simultaneously mounted mixed portals, noncancelable events, pointer/focus dismissal,
or modal pointer policy.
Without the two React content props, the renderers retain their independent stacks.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
