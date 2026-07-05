---
"@octanejs/base-ui": patch
---

New binding: `@octanejs/base-ui` — Base UI (`@base-ui/react`) ported to the octane
renderer, at full fidelity from `mui/base-ui` `v1.6.0` and verified byte-identical against
the real `@base-ui/react` via differential parity tests. Public API mirrors Base UI's
deep-subpath imports (`@octanejs/base-ui/separator`, `/fieldset`, `/meter`, `/progress`,
`/toggle`, `/toggle-group`, `/avatar`, `/use-render`, `/merge-props`).

Foundation: the shared composition engine (`useRender` / `useRenderElement` / `mergeProps`
— Base UI's universal `render`-prop model over octane's `cloneElement`/`createElement`;
native events made `preventBaseUIHandler`-able).

Phase 1 components: `Separator`, `Fieldset`, `Meter`, `Progress`, `Toggle`, `ToggleGroup`,
`Avatar` — including ports of Base UI's composite roving-focus system (CompositeRoot/List/Item
+ keyboard navigation, powering ToggleGroup) and its transition/animation system
(useTransitionStatus/useOpenChangeComplete, powering Avatar), plus the `useButton` /
`useControlled` / `useFocusableWhenDisabled` internals. See `docs/base-ui-migration-plan.md`
for the phased plan and running progress.
