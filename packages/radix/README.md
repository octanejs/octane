# @octanejs/radix

[Radix UI Primitives](https://www.radix-ui.com/primitives) for the
[octane](https://github.com/octanejs/octane) renderer — a port of
[`@radix-ui/react`](https://www.npmjs.com/org/radix-ui) (headless, accessible UI
primitives) on octane's hooks. It mirrors the unified `radix-ui` package's shape: the
low-level composition utilities are exported directly, and each component is a namespace
(`Separator.Root`, `Label.Root`).

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

**Phase 0 (foundation) + Phase 1 (first stateful components).** Landed:

- Composition foundation — `Slot`, `Slottable`, `Primitive.<tag>` (`asChild`), `mergeProps`
  (event chaining, `style` merge, clsx-style `class` composition), `composeRefs` /
  `useComposedRefs`, `composeEventHandlers`.
- State foundation — `useControllableState` (controlled/uncontrolled), `Presence` (keeps a
  child mounted through its CSS exit animation), the full **`createContextScope`**
  (`createScope` + `composeContextScopes`) so composed primitives can't collide,
  `createCollection` (the Collection primitive: `data-radix-collection-item` stamping +
  DOM-ordered item registry), and the `radix-`-prefixed `useId`.
- Components — `Separator`, `Label`, `Collapsible` (`Presence`-wrapped content with the
  `--radix-collapsible-content-height/-width` CSS vars), `Accordion` (single + multiple;
  `createAccordionScope` composes `createCollapsibleScope`, `__scope*` threaded through
  every part, **full Home/End/Arrow keyboard navigation** via the Collection), and
  **`Dialog`** (modal + non-modal: `Portal`/`Presence` mounting, `FocusScope` trap/loop +
  autofocus, `DismissableLayer` Escape/outside-press/outside-focus, `aria-hidden`
  hideOthers, body scroll lock, focus guards), **`AlertDialog`**, **`Toggle`**,
  **`ToggleGroup`** (single/multiple), and **`Tabs`** (automatic/manual activation,
  arrow-key navigation) — the latter three on the full **`RovingFocusGroup`** port.
- Overlay infra — `Portal`, `DismissableLayer`, `FocusScope`, `useFocusGuards`,
  `useScrollLock` (a focused `react-remove-scroll` replacement — see `scroll-lock.ts`),
  with the framework-agnostic `aria-hidden` package reused as-is.

**Verified against real Radix**: the differential suite
(`tests/differential/parity.test.ts`) runs the SAME fixture through `@octanejs/radix` and
the real `radix-ui` package on React, asserting byte-identical DOM after every interaction
step.

Deferred (documented in
[`docs/radix-migration-plan.md`](../../docs/radix-migration-plan.md)):
`RovingFocusGroup` (Tabs / Toolbar / ToggleGroup / RadioGroup).

Next: the Popper overlays (Tooltip / HoverCard / Popover / DropdownMenu) on top of
`@octanejs/floating-ui`, plus Toolbar / RadioGroup on the RovingFocus substrate.
