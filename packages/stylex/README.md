# @octanejs/stylex

[StyleX](https://stylexjs.com) for the [octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/stylex
pnpm add @octanejs/stylex
```

StyleX is a **build-time** CSS-in-JS system: a compiler turns `stylex.create({...})`
into atomic class names and extracts the CSS, and `stylex.props(...)` produces the
props you apply to an element. StyleX can resolve that composition at build time;
otherwise its small merge runs at runtime. So — unlike the zustand/motion
_runtime_ bindings — the octane integration is the **compiler pass**, shipped in two
parts:

- **`@octanejs/stylex`** — the authoring surface you import in components. It
  re-exports `@stylexjs/stylex` (so the runtime `props`/`attrs` and all the types
  work) and is registered as a StyleX _import source_ so the compiler finds your
  `stylex.*` call sites.
- **`@octanejs/stylex/vite`** — the Vite plugin that runs the StyleX compiler over
  octane's compiled `.tsrx` output and emits one static atomic stylesheet
  (`virtual:stylex.css`). CSS rules are extracted; the JavaScript works with class
  names and inline values. Whether a props merge remains depends on what StyleX
  can resolve at compile time.

## Setup

Add the plugin **after** `octane()` and import the generated sheet once:

```ts
// vite.config.ts
import { octane } from '@octanejs/vite-plugin';
import { stylex } from '@octanejs/stylex/vite';
import { knownAttributeSpreads } from '@octanejs/stylex/compiler/contract';

export default {
  plugins: [octane({ knownAttributeSpreads }), stylex()],
};
```

```ts
// app entry
import 'virtual:stylex.css';
```

For signal-aware native `sx` authoring in `.tsrx`, select the matching type-check
provider in `tsconfig.json`. It delegates to Octane's normal virtual TSX compiler
with the same native attribute contract:

```json
{
  "tsrx": { "compiler": "@octanejs/stylex/compiler" }
}
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

The compiler contract specializes `props()` and native `sx`, not `attrs()`.
If an application already specializes `@stylexjs/stylex.attrs`, keep that
runtime import and contract when adopting `sx` in the same file. An adapter
type import supplies the native JSX extension without replacing the runtime
namespace. A blanket import replacement can turn those existing spreads into
generic host-prop work.

### Native `sx` and signals

With the compiler contract above, a native `sx` expression accepts StyleX styles
and signal values in dynamic style arguments:

```tsx
import * as stylex from '@octanejs/stylex';
import type { SignalHandle } from 'octane/signals';

const styles = stylex.create({
  height: (height: number | null) => ({ height }),
});

export function Panel({ height$ }: { height$: SignalHandle<number | null> }) @{
  <div sx={styles.height(height$)} />
}
```

Octane reads the signal within the native binding; StyleX still decides the class
names, units, null handling, and precedence. Stylesheets remain separate from
that binding. A signal containing a complete StyleX style is supported by the
same `sx={appearance$}` syntax. Component-owned `sx` props are ordinary props and
are not rewritten.

Changing which style objects are applied recomputes their composition. That is
expected: StyleX may compile locally known conditions into an object lookup, or
retain `stylex.props` where a merge is needed. Octane applies the resulting fields
directly and skips unchanged DOM writes. The compiler contract does not by itself
eliminate a dynamic StyleX merge; a value-only fast path is a separate StyleX
compiler optimization, not a second merge implementation in Octane.

Type checking unwraps only native signal handles inside configured `.tsrx` `sx`
expressions. Dynamic style functions retain their original parameter types:
passing a boolean signal to the numeric `height` function is still an error, as
is passing a signal to `styles.height(...)` outside that context. Plain `.tsx`
does not use the virtual TSRX type checker; use an explicit sampled value such as
`sx={styles.height(height$.get())}` there. Sampling a payload property likewise
requires `.get()`, for example `sx={appearance$.get().selected}`; `appearance$.selected`
is a property of the handle, not its value.

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

- Native `sx` requires Octane's explicit compiler contract. The spread form
  remains supported without that shorthand.
- Reactive `sx` currently requires an inline native template. Stored JSX,
  explicitly keyed native JSX descriptors, hoisted head tags, overlapping
  class/style writers, and scoped classes on that same host report a compiler
  error. Keyed `@for` rows are supported. Signal reads inside callbacks,
  constructors, or tagged templates are not lifted.
- Renderer-free views require statically named dynamic style functions. Select
  between recipes with `sx={wide$ ? styles.width(size$) : styles.height(size$)}`;
  computed calls such as `styles[recipe$](size$)` cannot yet be proved safe by
  the renderer-free compiler, even though normal rendering supports them.
- The plugin runs the StyleX compiler on octane's _output_, so StyleX's own
  source-scanning tools (the PostCSS plugin) are not used and not needed.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
