# @octanejs/base-ui

## 0.1.2

### Patch Changes

- c2129eb: Form controls now pass real controlled props. With octane shipping React-parity controlled components (`value`/`checked` reassertion on native events), the bindings' hidden native inputs take controlled `checked`/`value` directly, and the workaround machinery — imperative property writes via native prototype setters in layout effects and the initial-checked attribute dance — is removed. Behavior is unchanged and stays differential-verified against the real React libraries.
- Updated dependencies [05fdef8]
- Updated dependencies [e9ebfbf]
- Updated dependencies [4ac4c98]
- Updated dependencies [c2129eb]
- Updated dependencies [4ac4c98]
- Updated dependencies [8a44bb5]
- Updated dependencies [6b0c244]
- Updated dependencies [d3cf678]
- Updated dependencies [05fdef8]
- Updated dependencies [d19d4f3]
- Updated dependencies [7e84258]
- Updated dependencies [2f8c6ed]
- Updated dependencies [8de4584]
- Updated dependencies [9be6ba5]
- Updated dependencies [db409de]
- Updated dependencies [4f3c6c8]
- Updated dependencies [62c3c4e]
- Updated dependencies [3c56d95]
- Updated dependencies [4c5b1d0]
- Updated dependencies [b732399]
- Updated dependencies [6d27cb0]
- Updated dependencies [a3784b1]
- Updated dependencies [fa77edf]
- Updated dependencies [f5c9dba]
- Updated dependencies [12d5410]
- Updated dependencies [d71f1fc]
- Updated dependencies [2f8c6ed]
- Updated dependencies [63e51e8]
- Updated dependencies [6d3b269]
- Updated dependencies [b171c6d]
- Updated dependencies [7f3d9c9]
- Updated dependencies [820baaf]
- Updated dependencies [c36cb32]
- Updated dependencies [c33f409]
- Updated dependencies [63e51e8]
- Updated dependencies [8fc8554]
- Updated dependencies [569daad]
- Updated dependencies [6b7b727]
- Updated dependencies [2ce7bc5]
- Updated dependencies [c6a23f5]
- Updated dependencies [c93aad5]
- Updated dependencies [2942afb]
- Updated dependencies [388b23c]
- Updated dependencies [352cff1]
- Updated dependencies [c7989eb]
- Updated dependencies [dda2854]
- Updated dependencies [dda2854]
- Updated dependencies [3a9d855]
- Updated dependencies [1f85217]
  - octane@0.1.4
  - @octanejs/floating-ui@0.1.3

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
