<p align="center">
  <picture>
    <!-- white wordmark in dark mode, black wordmark in light mode -->
    <source media="(prefers-color-scheme: dark)" srcset="./icon.svg">
    <img alt="Octane" src="./icon-black.svg" width="320">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/octanejs/octane/actions/workflows/ci.yml"><img src="https://github.com/octanejs/octane/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="#status"><img src="https://img.shields.io/badge/status-alpha-orange" alt="status: alpha"></a>
  <a href="https://www.npmjs.com/package/octane"><img src="https://img.shields.io/npm/v/octane?logo=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
</p>

Octane is a fast JavaScript UI framework, and the successor to
[Inferno](https://github.com/infernojs/inferno). You write components with the
React API you already know, and a compiler turns them into direct DOM code before
they ship. No virtual DOM, no rules-of-hooks bookkeeping, and no dependency
arrays to maintain by hand.

Created by [Dominic Gannaway](https://github.com/trueadm), who also created
Inferno and has worked on React, Lexical, Ripple, and Svelte.

```jsx
import { useState } from 'octane';

export function Counter() @{
	const [count, setCount] = useState(0);

	<button onClick={() => setCount(count + 1)}>
		{'Count: ' + count}
	</button>
}
```

## Why Octane

**Your React knowledge transfers.** `useState`, `useEffect`, `memo`, context,
portals, Suspense, transitions: same API, same mental model, checked case by case
against a large behavioral suite. React-derived coverage is tracked in the
generated [parity report](./docs/react-parity-coverage.md) rather than inferred
from the size of the suite.

**Standard JSX works, `.tsrx` gives you more.** Paste a component from the React
docs into a `.tsx` file and it runs. Or author in `.tsrx`, the spiritual
successor to JSX, and get template directives (`@if`, `@for`, `@switch`, `@try`)
that compile to keyed fast paths, plus an `@{ … }` shorthand that puts setup next
to the output. Mix both dialects in one app and import across the boundary.
[TSRX Syntax for VS Code](https://marketplace.visualstudio.com/items?itemName=TSRX.tsrx-vscode-plugin)
adds syntax highlighting, diagnostics, navigation, and completions for `.tsrx`
files.

**Write the closure, not its dependency list.** Omit the array from `useEffect`,
`useMemo`, `useCallback`, and friends, and the compiler derives it from what the
closure actually captures, including stable setters, dispatchers, refs, and state
getters. This is the no-bookkeeping DX people associate with signal frameworks,
without leaving the hooks model. Explicit arrays still mean exactly what they
mean in React.

**No rules of hooks.** Hooks are tracked by call site, not call order, so a hook
can live inside an `if` or after an early return. The one rule left is enforced
for you: a hook in a plain JS loop is a compile error, because every iteration
would share a single call-site slot. Use the keyed `@for` directive instead,
where each item gets its own hook state.

**The platform, not a reimplementation of it.** Real delegated DOM events,
controlled form components on native events (React's `value`/`checked` semantics,
with `onInput` per edit and native `onChange` on commit), and refs as plain props
(`ref={cb}`, `ref={obj}`, even `ref={[a, b]}`). No synthetic layer second-guessing
the browser.

**No virtual DOM.** Components re-render like React, but a compiled render path
and an LIS-based keyed reconciler keep the runtime overhead minimal.

Octane's native renderer is deliberately narrow where React has grown wide: no
class components, no Server Components, no synthetic event system. Those are
choices, not gaps, and they are written down in
[Differences from React](https://octanejs.dev/docs/differences-from-react).

## Also in the box

- **Editable state that follows its source.** `useLinkedState` resets or adjusts
  local state as soon as an input changes, with no effect and no state update
  during render.
- **Promises in render are safe.** No `cache()` wrapper: creations feeding
  `use()` are memoized at their declarations, including local `.then` chains.
  Independent requests start together, one suspension per stratum, and descendant
  fetch trees prefetch while an ancestor is still suspended.
- **Streaming SSR and byte-stable hydration**, with out-of-order Suspense
  flushing over Node or web streams, or buffered and static rendering when you
  want it.
- **Deferred hydration.** `<Hydrate>` keeps server HTML visible but inert until
  it is worth activating, and splits its children into their own chunk by
  default.
- **Behavior-only roots for externally owned DOM.** Attach abortable behavior
  and delegated native events to server-rendered or independently streamed
  markup without rendering it or taking reconciliation ownership.
- **React interoperability in both directions.** Keep real React components
  inside Octane with `ReactCompat`, or add Octane components to a React app with
  `OctaneCompat`. Both are available from `octane/react`.
- **Optional immutable render snapshots.** Add `"use strong"` to one module, or
  enable Strong mode for an application, to assert pure renders, catch
  detectable violations, and let production memoization condition every
  user-authored render call shape on its witnessed inputs.
- **`class` / `className` composes clsx-style** everywhere: strings, arrays,
  objects, and nesting, at every apply site.
- **A current-state getter.** `useState` and `useReducer` return
  `[state, update, getState]`, so a delayed callback can read the latest value
  instead of a stale capture.

## Install

Octane's published packages need Node.js 22.22.2 or newer.

Scaffold a project that already runs:

```bash
npm create octane my-app
cd my-app
npm run dev
```

`--template spa` is a client-only app and `--template fullstack` adds routing,
streaming SSR, hydration, and a production build; leave the flag off and it
asks.

In a project you already have, let the CLI wire it up instead, including the
TypeScript settings `.tsrx` needs:

```bash
pnpm dlx @octanejs/cli init
```

Or do it by hand:

```bash
pnpm add octane @octanejs/vite-plugin
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],
});
```

```ts
// main.ts
import { createRoot } from 'octane';
import { App } from './App.tsrx';

const root = createRoot(document.getElementById('root')!);
root.render(App, { title: 'Hello world!' });
```

Rspack and Rsbuild are supported too. [Getting started](./docs/getting-started.md)
covers all three build tools, server rendering, hydration, streaming, deferred
hydration, and profiling.

## React interoperability

`octane/react` lets each renderer keep ownership of its own components:

| Boundary       | What it renders                               | React version                                             |
| -------------- | --------------------------------------------- | --------------------------------------------------------- |
| `ReactCompat`  | Real React components inside an Octane app    | Matching React and React DOM 19.2+ in the React 19 series |
| `OctaneCompat` | Compiled Octane components inside a React app | React 19                                                  |

For a React component in an Octane template:

```tsrx
// App.tsrx — compiled by Octane.
import { ReactCompat } from 'octane/react';
import { Counter } from './Counter.react';

export function App() @{
	<ReactCompat><Counter start={3} /></ReactCompat>
}
```

```tsx
/** @jsxImportSource react */
// Counter.react.tsx — compiled by React's JSX transform.
import { useState } from 'react';

export function Counter({ start }: { start: number }) {
	const [count, setCount] = useState(start);
	return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Keep native Octane components in `.tsrx` and React components under React's JSX
transform. Mixed builds use `requireDirective: true` with both compilers; do not
alias React to Octane. The [React interoperability guide](./docs/react-compat.md)
includes compiler setup and the `component`/`props` form.

`ReactCompat` preserves React state, events, and refs. Map native context into
React explicitly with `bridgeReactContext(OctaneContext, ReactContext)` and the
boundary's `contexts` prop. In the opposite direction, an Octane component
inside `OctaneCompat` can read a real React context with Octane's `use` or
`useContext`.

Both boundaries have server implementations in `octane/react/server`. Octane's
server compiler retargets the import automatically; React-owned server entries
that bypass it must select the server entry explicitly. `ReactCompat` starts or
updates React work after Octane commits, so Octane transitions and `flushSync()`
do not synchronously commit the React root. See the guide for pending updates,
SSR buffering, hydration, and nesting limits.

## Status

Octane is in alpha. The runtime, compiler, and SSR/hydration paths all work, but
APIs still move.

The core suite contains **3,900+ distinct behavioral tests** across conformance,
differential, hydration, runtime, compiler, and SSR coverage. The `octane-prod`
project reruns the normal suite against the production compiler path, which is
valuable mode coverage but is not counted again as unique tests. This is an
Octane suite count, not a claim that every test was ported from React; the pinned
snapshot and source-attributed React counts live in the
[coverage ledger and report](./docs/react-parity-coverage.md).

## Documentation

The full docs live at **[octanejs.dev](https://octanejs.dev)**, a site built with
Octane itself. Good places to start:

- [Quick start](https://octanejs.dev/docs/quick-start): install, mount, and the
  `.tsrx` essentials.
- [Build tools](https://octanejs.dev/docs/build-tools): Vite, Rspack, or Rsbuild
  for SPA compilation and full-stack SSR.
- [TSRX vs TSX/JSX](https://octanejs.dev/docs/tsrx-vs-tsx): when to reach for
  each dialect and what TSRX unlocks.
- [Differences from React](https://octanejs.dev/docs/differences-from-react): the
  deliberate divergences, and why everything else matching React is the point.
- [Publishing libraries](https://octanejs.dev/docs/publishing-libraries): package
  all importable authored code so applications compile libraries against their
  own Octane runtime.
- [Bindings](https://octanejs.dev/docs/bindings): the `@octanejs/*` ports of the
  React ecosystem.
- [Framework integrations](https://octanejs.dev/docs/framework-integrations):
  use Octane with Astro, Docusaurus, or TanStack Start.
- [React interoperability](https://octanejs.dev/docs/react-compat): use
  `ReactCompat` for React inside Octane, or `OctaneCompat` for Octane inside React.

In this repository:

- [Getting started](./docs/getting-started.md): install, build tools, mount, SSR,
  streaming, deferred hydration, profiling.
- [TSRX basics](./docs/tsrx-basics.md): components, hooks, control flow, class
  composition, text input events, strong mode.
- [Server rendering](./docs/ssr.md) and
  [deferred hydration](./docs/deferred-hydration.md): the full references.
- [Differences from React](./docs/differences-from-react.md): the divergence
  contract.
- [ReactCompat](./docs/react-compat.md): React inside Octane, including compiler
  ownership, context mapping, boundaries, SSR, and hydration; links to the
  opposite `OctaneCompat` direction.
- [Bindings status](./docs/bindings-status.md): what each `@octanejs/*` package
  ports, its upstream version, and its known divergences.

## Packages

This is a pnpm monorepo. [`docs/packages.md`](./docs/packages.md) is the
generated inventory; the shape of it is:

- [`octane`](./packages/octane) is the runtime and the compiler together:
  rendering, the hook API, the server (SSR) and client (hydration) entry points,
  and the compiler itself, exposed at `octane/compiler` with bundler adapters at
  `octane/compiler/vite` and `octane/compiler/bundler`. Custom Node build pipelines
  can opt into [type-aware text compilation](./docs/compiler-text-inference.md).
- The app layer: [`@octanejs/app-core`](./packages/app-core) holds the
  bundler-neutral config, routing, SSR, hydration codegen, and production
  handler, and the [Vite](./packages/vite-plugin-octane),
  [Rspack](./packages/rspack-plugin-octane), and
  [Rsbuild](./packages/rsbuild-plugin-octane) integrations build on it.
  [`adapter-vercel`](./packages/adapter-vercel) and
  [`adapter-cloudflare`](./packages/adapter-cloudflare) deploy the output;
  [`@octanejs/tanstack-start`](./packages/tanstack-start) is the TanStack Start
  integration.
- Tooling: [`@octanejs/cli`](./packages/cli) (`create`, `init`, `doctor`,
  `analyze`, `add`, `explain`, `mcp add`),
  [`create-octane`](./packages/create-octane), the `npm create octane` entry
  point onto `octane create`, and
  [`@octanejs/mcp-server`](./packages/octane-mcp-server), which exposes Octane
  docs and compile tooling to AI agents over MCP.
- The `@octanejs/*` bindings, each an Octane port of a React library: state
  (zustand, jotai, valtio, mobx, redux, redux-toolkit, tanstack-store), data and
  routing (tanstack-query, apollo-client, tanstack-router, remix-router), UI
  (radix, base-ui, aria, shadcn, motion, dnd-kit, sonner, floating-ui, lucide),
  forms and content (hook-form, tanstack-form, lexical, tiptap, mdx, i18next),
  data-heavy screens (tanstack-table, tanstack-virtual, recharts, visx), 3D
  (three), Web3 (wagmi, rainbowkit), and more.

Parity varies by package. Some are behaviorally complete, others are explicitly
partial or alpha, and
[`docs/bindings-status.md`](./docs/bindings-status.md) is the generated table of
record: upstream version, supported surface, known divergences, SSR/hydration
coverage, and when the evidence was last checked.

## Sponsors

<a href="https://blacksmith.sh">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./website/src/assets/blacksmith-ci-on-dark.svg">
    <img width="352" height="96" alt="CI powered by Blacksmith" src="./website/src/assets/blacksmith-ci-on-light.svg">
  </picture>
</a>

**BlackSmith** - fast and efficient platform for running GitHub Actions, helping teams build, test, and deploy code faster while reducing CI costs. We thank Blacksmith for supporting our community as a sponsor!

## Contributing

Bug reports, regression tests, docs, bindings, and core fixes are all welcome.
[CONTRIBUTING.md](./CONTRIBUTING.md) covers setup, where a change belongs, the
test policy, the generated files, and how pull requests are labelled and landed.

```bash
pnpm install
pnpm test
pnpm typecheck
```

## License

MIT
