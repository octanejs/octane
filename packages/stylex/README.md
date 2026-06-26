# @octanejs/stylex

[StyleX](https://stylexjs.com) for the [octane](https://github.com/octanejs/octane) renderer.

StyleX is a **build-time** CSS-in-JS system: a compiler turns `stylex.create({...})`
into atomic class names and extracts the CSS, and `stylex.props(...)` merges those at
runtime into the props you spread onto an element. So — unlike the zustand/motion
_runtime_ bindings — the octane integration is the **compiler pass**, shipped in two
parts:

- **`@octanejs/stylex`** — the authoring surface you import in components. It
  re-exports `@stylexjs/stylex` (so the runtime `props`/`attrs` and all the types
  work) and is registered as a StyleX _import source_ so the compiler finds your
  `stylex.*` call sites.
- **`@octanejs/stylex/vite`** — the Vite plugin that runs the StyleX compiler over
  octane's compiled `.tsrx` output and emits one static atomic stylesheet
  (`virtual:stylex.css`). **Zero StyleX runtime ships in your bundle.**

## Setup

Add the plugin **after** `octane()` and import the generated sheet once:

```ts
// vite.config.ts
import { octane } from 'octane/compiler/vite';
import { stylex } from '@octanejs/stylex/vite';

export default {
  plugins: [octane(), stylex()],
};
```

```ts
// app entry
import 'virtual:stylex.css';
```

## Usage

```tsx
import * as stylex from '@octanejs/stylex';

const styles = stylex.create({
  root: { padding: 16, color: 'tomato' },
  active: { color: 'blue' },
});

export function Card(props) @{
  <div {...stylex.props(styles.root, props.on && styles.active)}>{'Card'}</div>
}
```

`stylex.props()` returns `{ className?, style? }`. Octane host elements take that
directly — the spread handler maps both `className` and `class` to the `class`
attribute and applies a `style` object — so there's no octane-specific `props()`
variant to learn. `stylex.attrs()` (which returns `{ class, style }` as a string) is
also re-exported for raw-attribute contexts.

## How it works

`octane()` (`enforce: 'pre'`) compiles `.tsrx` → JS, preserving the `stylex.*` calls.
`stylex()` (`enforce: 'post'`) then runs `@stylexjs/babel-plugin` over that output:
each `stylex.create`/`props`/`keyframes`/`defineVars`/`createTheme` call is replaced
with its compiled atomic form, and the extracted rules from every module are folded
into `virtual:stylex.css` — deduped by content-hashed key and ordered by StyleX's
baked-in cascade priority (so import order is irrelevant). In dev, editing a file
re-aggregates the sheet (HMR full-reload). In a production build, where the virtual
module can be loaded before every styled module has been transformed, the sheet is
finalized in `generateBundle` once all rules are collected — so the shipped CSS always
contains every rule regardless of module/transform order.

## Options

`stylex(options)`:

- `include` — files to scan (default: `.tsrx`/`.tsx`/`.jsx`/`.ts`/`.js`).
- `importSources` — specifiers treated as StyleX (default: `@octanejs/stylex` +
  `@stylexjs/stylex`).
- `dev` — force dev/prod compilation (default: dev while Vite is serving).
- `useCSSLayers` — emit `@layer` rules instead of the `:not(#\#)` specificity hack.
- `unstable_moduleResolution` — StyleX cross-file token (`.stylex.ts`) resolution.
- `stylexOptions` — escape hatch for any other `@stylexjs/babel-plugin` option.

## Divergences

- StyleX's `sx` JSX prop is not supported — use the `{...stylex.props(...)}` spread
  (which is also StyleX's own recommended pattern).
- The plugin runs the StyleX compiler on octane's _output_, so StyleX's own
  source-scanning tools (the PostCSS plugin) are not used and not needed.
