# @octanejs/styled-components

[styled-components](https://styled-components.com) for the
[octane](https://github.com/octanejs/octane) renderer — an API- and
behavior-compatible port of the styled-components v6 web surface, built from
the upstream 6.4.3 sources.

Everything you'd import from `styled-components` works here: `styled` with
every HTML/SVG tag shortcut, `.attrs`/`.withConfig` chaining, `css`,
`keyframes`, `createGlobalStyle`, `createTheme`, theming (`ThemeProvider`,
`ThemeContext`, `ThemeConsumer`, `useTheme`, `withTheme`), `StyleSheetManager`
(custom targets, namespaces, vendor prefixing, stylis plugins,
`shouldForwardProp`), `ServerStyleSheet`, and `isStyledComponent` — including
component selectors, `styled(Styled)` folding, transient `$` props, and
`as`/`forwardedAs` polymorphism. The React Native surface and the RSC-only
`stylisPluginRSC` are not ported.

## Install

```bash
pnpm add @octanejs/styled-components
```

`octane` is a peer dependency.

## Usage

```tsx
import styled, { ThemeProvider, createGlobalStyle } from '@octanejs/styled-components';

const Global = createGlobalStyle`
  body { margin: 0; font-family: system-ui; }
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 0.5em 1em;
  color: ${props => (props.$primary ? 'white' : props.theme.fg)};
  background: ${props => (props.$primary ? props.theme.accent : 'transparent')};
`;

export function App() @{
  <ThemeProvider theme={{ fg: 'black', accent: 'rebeccapurple' }}>
    <Global />
    <Button $primary onClick={() => console.log('hi')}>Save</Button>
  </ThemeProvider>
}
```

### Server rendering

SSR needs **no setup**. Styled rules, keyframes, and global styles rendered on
the server flow through octane's css channel, so `renderToString` returns them
in `RenderResult.css` (and `renderToPipeableStream`/`renderToReadableStream`
interleave them ahead of each pass's html):

```ts
import { renderToString } from 'octane/server';

const { html, css } = renderToString(App);
// css: '<style data-octane="sc.<componentId>.<class>">…</style>…'
```

On the client, the engine adopts those server chunks at boot — the same
component renders reuse the adopted rules with no duplicate injection.

`ServerStyleSheet` still works as a compatibility wrapper
(`sheet.collectStyles(...)` + `sheet.getStyleTags()`) for code written against
the upstream SSR docs; prefer the automatic channel and use one of the two per
page. `interleaveWithNodeStream` throws — octane streaming already interleaves
styles.

### Architecture

CSS compilation and rule delivery are separate layers. The shared sheet owns
component ordering and content caches; explicit outputs handle browser
CSSOM/text insertion, Octane's stateless per-request SSR channel, or the
in-memory capture used by `ServerStyleSheet`. Dynamic interpolations and
`.attrs` functions still run on every component render, while unchanged
compiled CSS is deduplicated by content. Static component styles additionally
reuse their injected class for stable client sheet/Stylis configurations;
dynamic styles never use that shortcut.

## Octane adaptations

- `ref` is a plain prop (octane has no `forwardRef`); it always attaches to
  the rendered element and is never filtered by `shouldForwardProp`.
- `defaultProps` on a styled component is resolved by the factory at render
  time; `styled(Styled)` folding deep-merges as upstream.
- Polymorphic `as` typing is pragmatic: component targets infer props from
  their function signature; host tags accept a permissive prop bag (octane has
  no `JSX.IntrinsicElements` map).
- The babel `css` prop transform is not supported.
- Unnamed stylis plugins throw the documented error 15 (upstream 6.4.3
  constructs that error but forgets to throw it).

## Status

See the generated [bindings status table](../../docs/bindings-status.md) and
this package's [status.json](./status.json) for the verified surface and the
full divergence list.

Ported from [styled-components](https://github.com/styled-components/styled-components)
(MIT © Glen Maddern and contributors).
