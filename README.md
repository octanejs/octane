# octane

[![CI](https://github.com/octane-ts/octane/actions/workflows/ci.yml/badge.svg)](https://github.com/octane-ts/octane/actions/workflows/ci.yml)
[![status: alpha](https://img.shields.io/badge/status-alpha-orange)](#status)
[![npm version](https://img.shields.io/npm/v/octane-ts?logo=npm)](https://www.npmjs.com/package/octane-ts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

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

Components are written in `.tsrx`, a format that lets your TypeScript setup live
right next to the markup it feeds.

Created by [Dominic Gannaway](https://github.com/trueadm), who also created
Inferno and has worked on React, Lexical, and Svelte.

## Status

Octane is alpha software. The runtime, compiler, and SSR/hydration paths all work
and have a large test suite behind them, but the API can still change and some
features are still landing. It is a good time to try it and report back. It is
not ready for production yet.

## Highlights

- The React API you already know: `useState`, `useReducer`, `useEffect`,
  `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useId`,
  `useImperativeHandle`, `useTransition`, `useDeferredValue`,
  `useSyncExternalStore`, `useActionState`, `useFormStatus`, and `useOptimistic`,
  plus `createContext`, `useContext`, `memo`, portals, `Suspense`, and
  `startTransition`. Class components and server components are left out on
  purpose.
- No rules of hooks. The compiler gives every hook call site a stable identity,
  so order never matters. A hook can sit inside a condition, after an early
  return, or in a loop.
- Performance was the whole reason Inferno existed, and Octane keeps it. The
  compiler does most of the work ahead of time, so the runtime stays small.
- Real DOM events through delegation, rather than a synthetic event layer, so
  event behavior matches the platform.
- One authoring format, `.tsrx`, with full TypeScript support and editor tooling.

## Quick start

### Install

```bash
pnpm add octane-ts @octane-ts/vite-plugin
```

Add the plugin to your Vite config:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from 'octane-ts/compiler/vite';

export default defineConfig({
  plugins: [octane()],
});
```

`@octane-ts/vite-plugin` is the optional metaframework (dev SSR, routing, hydrate). For
a plain SPA you only need the `octane()` compiler plugin shown above.

### Mount

```ts
// main.ts
import { createRoot } from 'octane-ts';
import { App } from './App.tsrx';

const root = createRoot(document.getElementById('root')!);
root.render(App, { title: 'Hello world!' });
```

### Server render and hydrate

```ts
// entry-server.ts
import { render } from 'octane-ts/server';
import { App } from './App.tsrx';

export async function renderApp() {
  const { head, body, css } = await render(App);
  return { head, body, css };
}
```

```ts
// entry-client.ts
import { hydrate } from 'octane-ts';
import { App } from './App.tsrx';

hydrate(App, document.getElementById('app')!);
```

## Core syntax

### Components

A component is a function. Return a single JSX root directly, or open a `@{ ... }`
setup scope when TypeScript setup (hooks, locals) needs to sit next to the output.
The scope ends with one output node, either a JSX element or a fragment.

```tsrx
import { useState } from 'octane-ts';

export function Counter() @{
  const [count, setCount] = useState(0);

  <button onClick={() => setCount(count + 1)}>
    {'Count: ' + count as string}
  </button>
}
```

Dynamic text holes are written `{expr as string}`. Events are ordinary JSX event
props like `onClick` and `onInput`, backed by native, delegated DOM events.

### State and effects

```tsrx
import { useState, useEffect } from 'octane-ts';

export function Timer() @{
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  <p>{'Elapsed: ' + seconds as string}</p>
}
```

### Conditional hooks

Unlike React, a hook can sit behind a guard or after an early `return`:

```tsrx
import { useState, useEffect } from 'octane-ts';

export function Panel(props) @{
  const [n, setN] = useState(0);

  // An early return before a hook is fine in octane. Each hook call site has a
  // stable compiler-assigned slot, so render order can't desync the hooks.
  if (props.hidden) return;

  useEffect(() => {
    console.log('n changed:', n);
  }, [n]);

  <button onClick={() => setN(n + 1)}>{'count: ' + n as string}</button>
}
```

### Control flow

Rendered control flow uses directive-prefixed blocks: `@if`, `@for`, `@switch`,
and `@try`. Plain JavaScript control flow stays in setup code.

```tsrx
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

```tsrx
export function Greeting(props) @{
  @if (props.name) {
    <p>{'Hello, ' + props.name as string}</p>
  } @else {
    <p>Hello, stranger</p>
  }
}
```

## Packages

This is a pnpm monorepo with two publishable packages:

- [`octane`](./packages/octane) is the runtime and the compiler together. It covers
  rendering, the hook API, the server (SSR) and client (hydration) entry points,
  and the compiler itself, which is exposed at `octane-ts/compiler` (and
  `octane-ts/compiler/vite` for the build transform).
- [`@octane-ts/vite-plugin`](./packages/vite-plugin-octane) is the optional metaframework
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
