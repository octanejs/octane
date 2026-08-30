# @octanejs/floating-ui

[Floating UI](https://floating-ui.com) for the [octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/floating-ui
pnpm add @octanejs/floating-ui
```

A port of `@floating-ui/react` 0.27.19 — positioning (`useFloating`, the
ref-aware `arrow`, the `@floating-ui/dom` middleware re-exports, the floating
tree), the full interaction-hook set (`useInteractions`, `useHover` +
`safePolygon`, `useClick`, `useFocus`, `useDismiss`, `useRole`,
`useClientPoint`, `useListNavigation`, `useTypeahead`), the component layer
(`FloatingPortal`, `FloatingOverlay`, `FloatingFocusManager`, `FloatingArrow`,
`FloatingList`, `Composite`), transitions, both delay-group APIs, and the
deprecated `inner`/`useInnerOffset` pair. As everywhere in octane, `forwardRef`
becomes a plain `ref` prop.

```tsx
import { useFloating, useInteractions, useHover, offset, flip } from '@octanejs/floating-ui';
```

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
