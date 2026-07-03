# @octanejs/floating-ui

## 0.1.1

### Patch Changes

- e8ee0a8: New package: `@octanejs/floating-ui` — a port of `@floating-ui/react` for the octane
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

  Phase 4 (transitions + delay group) is complete: `useTransitionStatus` /
  `useTransitionStyles` (placement-aware CSS-transition state/styles, using octane's
  `flushSync`) and `FloatingDelayGroup` / `useDelayGroup` / `useDelayGroupContext`.
  Validated with a fade-tooltip transition test.

  Remaining: rewiring `@octanejs/lexical`'s `NodeContextMenuPlugin` onto this package.

- Updated dependencies [c19f1aa]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [86ae0c5]
- Updated dependencies [357f841]
- Updated dependencies [6675ac7]
- Updated dependencies [f414710]
- Updated dependencies [894d51c]
- Updated dependencies [f44fb6b]
- Updated dependencies [056c441]
- Updated dependencies [aa9cc6e]
- Updated dependencies [0f57f20]
- Updated dependencies [f44fb6b]
- Updated dependencies [067efa3]
- Updated dependencies [f0c6c4d]
- Updated dependencies [dd24fd5]
- Updated dependencies [524939e]
- Updated dependencies [e8ee0a8]
- Updated dependencies [b680431]
- Updated dependencies [524939e]
- Updated dependencies [7f8dbc0]
- Updated dependencies [a13acd1]
- Updated dependencies [067efa3]
- Updated dependencies [524939e]
- Updated dependencies [894d51c]
- Updated dependencies [894d51c]
- Updated dependencies [1960647]
- Updated dependencies [e8ee0a8]
- Updated dependencies [93e2733]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [bbc3275]
- Updated dependencies [ed6afad]
- Updated dependencies [40bcb16]
- Updated dependencies [c842fb7]
- Updated dependencies [c62efa7]
- Updated dependencies [524939e]
- Updated dependencies [b3a9191]
- Updated dependencies [ffe32c4]
- Updated dependencies [e1f996b]
- Updated dependencies [6983478]
- Updated dependencies [fc36e15]
- Updated dependencies [524939e]
- Updated dependencies [405f06e]
- Updated dependencies [f50c829]
- Updated dependencies [b3a9191]
- Updated dependencies [dd24fd5]
- Updated dependencies [7042056]
- Updated dependencies [6983478]
- Updated dependencies [e031a7d]
- Updated dependencies [86ae0c5]
- Updated dependencies [a33cdd6]
- Updated dependencies [067efa3]
- Updated dependencies [fab1cb0]
- Updated dependencies [6983478]
- Updated dependencies [dd24fd5]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [cb9ad82]
- Updated dependencies [ea6352e]
- Updated dependencies [1987bd7]
- Updated dependencies [0c4d5a1]
- Updated dependencies [dd24fd5]
- Updated dependencies [fcac573]
- Updated dependencies [41aa22a]
- Updated dependencies [c842fb7]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [634fd52]
- Updated dependencies [149800c]
- Updated dependencies [aafaaa9]
- Updated dependencies [1987bd7]
- Updated dependencies [74cbff9]
- Updated dependencies [894d51c]
- Updated dependencies [0040cad]
- Updated dependencies [a3dce2f]
- Updated dependencies [3656e32]
- Updated dependencies [43d940d]
- Updated dependencies [a032c5c]
- Updated dependencies [7f8dbc0]
- Updated dependencies [c71d4f3]
- Updated dependencies [a3dce2f]
- Updated dependencies [c2f3f69]
- Updated dependencies [3656e32]
- Updated dependencies [1987bd7]
- Updated dependencies [f42e5b7]
- Updated dependencies [cc2bca1]
- Updated dependencies [6983478]
- Updated dependencies [1987bd7]
  - octane@0.1.2
