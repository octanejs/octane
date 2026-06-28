---
"@octanejs/floating-ui": patch
---

New package: `@octanejs/floating-ui` — a port of `@floating-ui/react` for the octane
renderer, built on the framework-agnostic `@floating-ui/dom`. This lets octane
bindings (e.g. `@octanejs/lexical`'s context menu + floating toolbars) use the same
positioning + interaction primitives as their React counterparts.

Phase 1 (positioning) landed:

- `useFloating` — the positioning hook (placement, strategy, middleware, external
  elements, `whileElementsMounted`, `open`), returning `refs` / `elements` /
  `floatingStyles` / `update` / `isPositioned`.
- `useMergeRefs` — merge multiple refs into one callback ref.
- `arrow` — the ref-aware arrow middleware.
- Re-exports of the `@floating-ui/dom` middleware (`offset`, `flip`, `shift`,
  `size`, `autoPlacement`, `hide`, `inline`, `limitShift`, `autoUpdate`,
  `computePosition`, `platform`, `detectOverflow`, `getOverflowAncestors`).

Each hook forwards the octane compiler's call-site slot through `subSlot`, so the
hooks work when consumed from `node_modules` and multiple `useFloating` calls in one
component stay isolated.

Phase 2 (interactions) is complete: the `@floating-ui/react/utils` helpers, the
context/event system (`useFloatingRootContext`, `createPubSub`, and the full
`useFloating` returning the interaction `context`), and the full interaction-hook
set — `useInteractions`, `useRole`, `useClick`, `useFocus`, `useDismiss`,
`useHover` (+ `safePolygon`), `useListNavigation`, `useTypeahead`, `useClientPoint`.
A key adaptation: octane events are native, so the React hooks' `event.nativeEvent`
accesses become `event`. Validated by tests including an accessible popover and a
click-to-open / escape-to-close menu.

Phase 3 (components) is complete: `FloatingOverlay`, `FloatingPortal` (+ `FocusGuard`,
`useFloatingPortalNode`, `PortalContext`), `FloatingList` (+ `useListItem`),
`FloatingTree`/`FloatingNode`/`useFloatingNodeId`, `FloatingArrow`, `Composite`/
`CompositeItem`, and `FloatingFocusManager` (+ `VisuallyHiddenDismiss`). These are
plain `.ts` components built with `createElement` (octane has no JSX runtime); React
`forwardRef` → `props.ref`, and `ReactDOM.createPortal` → octane's value-position
`createPortal`. `FloatingArrow` renders real SVG via octane's de-opt SVG-namespace
support; `FloatingFocusManager`'s trap (markOthers aria-hide/inert + return-focus +
guards) works on octane's capture-phase focus delegation. Validated with tests for the
portal, overlay, arrow, modal focus trap, and Composite roving-tabindex navigation.

Remaining: the transition hooks (`useTransitionStatus`/`useTransitionStyles`) +
`FloatingDelayGroup`, then rewiring `@octanejs/lexical`'s `NodeContextMenuPlugin` onto
this package.
