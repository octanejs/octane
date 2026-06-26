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

Octane is a fast, TypeScript-first UI framework. It is the successor to
[Inferno](https://github.com/infernojs/inferno), the React-like library that set
out to stay close to the speed of hand-written DOM code. Octane carries that
performance-first goal forward and brings the programming model up to date. You
get the React API you already know, a compiler that keeps the runtime small and
fast, and hooks that no longer come with the rules of hooks.

Anyone comfortable with React can pick up Octane quickly. The familiar building
blocks are all here and they behave the way you expect. The main difference is
under the hood: Octane compiles your components ahead of time, so a lot of the work
React does at runtime is already done before the page loads. Hooks are tracked by
call site rather than call order, which is what lets you call them conditionally.

Components can be written in stanadard `.tsx`/`.jsx` but opting for  `.tsrx` provides
better performance guarantees, espeically around collections. TSRX is the spiritual successor
to JSX, and allows for far better composability and fututre optimizations.

Created by [Dominic Gannaway](https://github.com/trueadm), who also created
Inferno and has worked on React, Lexical, Ripple, and Svelte.

## Status

Octane is currently in alpha development.

## Highlights

- The React API you already know: `useState`, `useEffect`, `useMemo`, `useRef`, `useId`,
  `useTransition`, `useDeferredValue` etc.
- Support for JSX/TSX and TSRX, with extended performance benefits from using TSRX.
- No rules of hooks. The compiler gives every hook call site a stable identity,
  so order never matters.
- No virtual DOM, no signals, components re-render like React but with minimal overhead.
- Fully async support, including transitions, deferred values and support for `<Activity>`.
- Support for ref array composition `<div ref={[ref1, ref2]} />`.
- Real DOM events through delegation, rather than a synthetic event layer, so
  event behavior matches the platform.
- Full server-side rendering support and hydration.
- Class components and server components are not supported.
- `<ErrorBoundary>` provided for handling of errors, or using `@try` via TSRX.

## Quick start

### Install

```bash
pnpm add octane @octanejs/vite-plugin
```

Add the plugin to your Vite config:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
  plugins: [octane()],
});
```

`@octanejs/vite-plugin` is the optional metaframework (dev SSR, routing, hydrate). For
a plain SPA you only need the `octane()` compiler plugin shown above.

### Mount

```ts
// main.ts
import { createRoot } from 'octane';
import { App } from './App.tsrx';

const root = createRoot(document.getElementById('root')!);
root.render(App, { title: 'Hello world!' });
```

### Server render and hydrate

```ts
// entry-server.ts
import { render } from 'octane/server';
import { App } from './App.tsrx';

export async function renderApp() {
  const { head, body, css } = await render(App);
  return { head, body, css };
}
```

```ts
// entry-client.ts
import { hydrateRoot } from 'octane';
import { App } from './App.tsrx';

hydrateRoot(document.getElementById('app')!, App);
```

## Core syntax

### Components

A component is any function you use at a `<Foo/>` site — there's no separate
"component" declaration. A function renders whatever it returns: a JSX root, a
primitive (coerced to text), `null`, or an array. `@{ … }` is simply shorthand
for returning JSX — `function f() @{ … }` desugars to `function f() { … return
<jsx> }` — so hooks and locals can sit next to the output (the `@{ … }` scope ends
with one output node, a JSX element or a fragment). Both forms compile
identically, and any function can use either.

```jsx
import { useState } from 'octane';

export function Counter() @{
  const [count, setCount] = useState(0);

  <button onClick={() => setCount(count + 1)}>
    {'Count: ' + count}
  </button>
}
```

The same component written with an explicit `return` is identical — and a
function is free to return a non-JSX value, which is coerced like any renderable:

```jsx
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>;
}

function Label(props) {
  if (props.hidden) return null; // renders nothing
  return props.text; // a string renders as text
}
```

### State and effects

```jsx
import { useState, useEffect } from 'octane';

export function Timer() @{
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  <p>{'Elapsed: ' + seconds}</p>
}
```

### Conditional hooks

Unlike React, a hook can sit behind a guard or after an early `return`:

```jsx
import { useState, useEffect } from 'octane';

export function Panel(props) @{
  const [n, setN] = useState(0);

  // An early return before a hook is fine in octane. Each hook call site has a
  // stable compiler-assigned slot, so render order can't desync the hooks.
  if (props.hidden) return;

  useEffect(() => {
    console.log('n changed:', n);
  }, [n]);

  <button onClick={() => setN(n + 1)}>{'count: ' + n}</button>
}
```

### Control flow

Rendered control flow uses directive-prefixed blocks: `@if`, `@for`, `@switch`,
and `@try`. Plain JavaScript control flow stays in setup code.

```jsx
export function Feed(props) @{
  <ul>
    @for (const item of props.items; key item.id) {
      <li>{item.title as string}</li>
    } @empty {
      <li>Nothing to show</li>
    }
  </ul>
}
```

```jsx
export function Greeting(props) @{
  @if (props.name) {
    <p>{'Hello, ' + props.name}</p>
  } @else {
    <p>Hello, stranger</p>
  }
}
```

## Packages

This is a pnpm monorepo with two publishable packages:

- [`octane`](./packages/octane) is the runtime and the compiler together. It covers
  rendering, the hook API, the server (SSR) and client (hydration) entry points,
  and the compiler itself, which is exposed at `octane/compiler` (and
  `octane/compiler/vite` for the build transform).
- [`@octanejs/vite-plugin`](./packages/vite-plugin-octane) is the optional metaframework
  plugin, with dev SSR, routing, and hydration wiring for full apps.

## Development

Octane uses [pnpm](https://pnpm.io) for package management and workspace scripts.

```bash
pnpm install      # install workspace dependencies
pnpm test         # run the test suite
pnpm typecheck    # type-check the packages
pnpm format       # format with Prettier
```

### Playground

The playground under [`playground/octane`](./playground/octane) covers state, keyed
lists, conditional rendering, `@switch`, dynamic components, and suspense:

```bash
pnpm --filter octane-playground dev
```

## License

MIT
