# @octanejs/base-ui

## 0.1.1

### Patch Changes

- fda2200: New binding: `@octanejs/base-ui` — Base UI (`@base-ui/react`) ported to the octane
  renderer, at full fidelity from `mui/base-ui` `v1.6.0` and verified byte-identical against
  the real `@base-ui/react` via differential parity tests. Public API mirrors Base UI's
  deep-subpath imports (`@octanejs/base-ui/separator`, `/fieldset`, `/meter`, `/progress`,
  `/toggle`, `/toggle-group`, `/avatar`, `/switch`, `/checkbox`, `/radio`, `/radio-group`, `/checkbox-group`, `/field`, `/form`, `/input`, `/use-render`, `/merge-props`).

  Foundation: the shared composition engine (`useRender` / `useRenderElement` / `mergeProps`
  — Base UI's universal `render`-prop model over octane's `cloneElement`/`createElement`;
  native events made `preventBaseUIHandler`-able).

  Phase 1 components: `Separator`, `Fieldset`, `Meter`, `Progress`, `Toggle`, `ToggleGroup`,
  `Avatar` — including ports of Base UI's composite roving-focus system (CompositeRoot/List/Item
  - keyboard navigation, powering ToggleGroup) and its transition/animation system
    (useTransitionStatus/useOpenChangeComplete, powering Avatar), plus the `useButton` /
    `useControlled` / `useFocusableWhenDisabled` internals.

  Phase 2 (in progress): the Field/Form context infrastructure + the boolean/choice controls
  `Switch`, `Checkbox`, `Radio`, `RadioGroup`, the Field/Form validation system (`Field.*`, `Form`), and `Input` — with the octane uncontrolled-input adaptation
  (initial-checked attribute + imperative `.checked` property via the native setter + native
  change dispatch), matching React's controlled input byte-for-byte. RadioGroup reuses the
  composite roving-focus system. See `docs/base-ui-migration-plan.md` for the phased plan and
  running progress.

- Updated dependencies [71b5167]
- Updated dependencies [7b2acbd]
- Updated dependencies [a000fa2]
- Updated dependencies [71b5167]
- Updated dependencies [735f5ca]
- Updated dependencies [634c4b4]
- Updated dependencies [1987d47]
- Updated dependencies [fda2200]
- Updated dependencies [71b5167]
- Updated dependencies [fda2200]
- Updated dependencies [3431ec3]
- Updated dependencies [3afe217]
- Updated dependencies [1a1f1db]
- Updated dependencies [3431ec3]
- Updated dependencies [5e3858f]
- Updated dependencies [d2afbbb]
- Updated dependencies [1987d47]
- Updated dependencies [eb48930]
- Updated dependencies [3431ec3]
- Updated dependencies [87c5bc3]
  - octane@0.1.3
  - @octanejs/floating-ui@0.1.2
