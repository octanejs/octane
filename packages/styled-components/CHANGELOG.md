# @octanejs/styled-components

## 0.1.5

### Patch Changes

- 3ffce4c: Update the TSRX compiler adapters and Ripple integration to their synchronized
  latest releases, including the nested-JSX slash parsing fix and Solid 2 beta.15
  alignment. Refresh the supported dependency ranges shipped by the affected
  framework bindings and build integrations.
- Updated dependencies [a719b93]
- Updated dependencies [19c3ff1]
- Updated dependencies [6cecb47]
- Updated dependencies [d6ee673]
- Updated dependencies [9b6cd79]
- Updated dependencies [40d562b]
- Updated dependencies [3ffce4c]
- Updated dependencies [b92d76e]
- Updated dependencies [f325775]
- Updated dependencies [c36608c]
- Updated dependencies [5974429]
- Updated dependencies [af337d0]
- Updated dependencies [b5b5880]
  - octane@0.1.13

## 0.1.4

### Patch Changes

- Updated dependencies [a88f9ea]
- Updated dependencies [443bba7]
- Updated dependencies [d388e80]
- Updated dependencies [2f2a204]
- Updated dependencies [0223241]
- Updated dependencies [f9234f6]
- Updated dependencies [fa11116]
- Updated dependencies [ec7ffbf]
- Updated dependencies [25d266b]
- Updated dependencies [d388e80]
  - octane@0.1.12

## 0.1.3

### Patch Changes

- Updated dependencies [f7e1cba]
- Updated dependencies [082b681]
- Updated dependencies [9d86d20]
- Updated dependencies [082b681]
- Updated dependencies [742ae9d]
- Updated dependencies [2932a23]
- Updated dependencies [e0c2f09]
- Updated dependencies [082b681]
- Updated dependencies [082b681]
  - octane@0.1.11

## 0.1.2

### Patch Changes

- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - octane@0.1.10

## 0.1.1

### Patch Changes

- c16778a: Add the Octane binding for styled-components (6.4.3): the full v6 web API —
  `styled` with all tag shortcuts, `.attrs`/`.withConfig`, `css`, `keyframes`,
  `createGlobalStyle`, `createTheme`, theming (`ThemeProvider`/`useTheme`/
  `withTheme`/`ThemeConsumer`), `StyleSheetManager` (targets, namespaces, stylis
  plugins, `shouldForwardProp`), `ServerStyleSheet`, and `isStyledComponent` —
  ported from the upstream sources onto octane's ref-as-prop components. SSR is
  zero-config: server renders emit styles through octane's css channel into
  `RenderResult.css` (streaming-safe, per-request isolated), and client boot
  adopts the server chunks without duplicate injection. Includes conformance,
  differential React-parity, SSR, and hydration test suites. The React Native
  surface and RSC-only `stylisPluginRSC` are not ported. Interpolation and
  `.attrs` functions are evaluated on every actual render, with unchanged CSS
  deduplicated after evaluation so closure-backed styles remain live. Proven
  static styles share a weakly keyed client cache across component instances,
  without retaining custom sheets or Stylis configurations.
- Updated dependencies [c704664]
- Updated dependencies [5b7d9ed]
- Updated dependencies [5b7d9ed]
- Updated dependencies [91b5f45]
- Updated dependencies [c16778a]
- Updated dependencies [39f2c00]
- Updated dependencies [aabf79c]
- Updated dependencies [07511e4]
- Updated dependencies [5b7d9ed]
- Updated dependencies [0d2e265]
- Updated dependencies [3168360]
- Updated dependencies [81c8842]
  - octane@0.1.9
