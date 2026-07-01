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
- State foundation — `useControllableState` (controlled/uncontrolled) and `Presence`
  (keeps a child mounted through its CSS exit animation).
- Components — `Separator`, `Label`, `Collapsible`, `Accordion` (single + multiple).

Deferred follow-ups (documented in
[`docs/radix-migration-plan.md`](../../docs/radix-migration-plan.md)): `createContextScope`
scope-isolation (Collapsible/Accordion use plain octane context for now); `Collapsible`'s
`--radix-collapsible-content-height` CSS-var measurement + `Presence`-based exit-animation
defer; and Accordion's arrow-key roving focus (a separate reusable primitive).

Next: the overlay family (Dialog / Popover / Tooltip / DropdownMenu) on top of
`@octanejs/floating-ui`, plus a differential-vs-real-`@radix-ui` harness.
