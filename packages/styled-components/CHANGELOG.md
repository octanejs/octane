# @octanejs/styled-components

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
