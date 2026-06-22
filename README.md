# vyre

[![CI](https://github.com/vyre-ts/vyre/actions/workflows/ci.yml/badge.svg)](https://github.com/vyre-ts/vyre/actions/workflows/ci.yml)
[![status: alpha](https://img.shields.io/badge/status-alpha-orange)](#status)
[![npm version](https://img.shields.io/npm/v/vyre?logo=npm)](https://www.npmjs.com/package/vyre)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**vyre is a fast, TypeScript-first UI framework with the React API you already
know, without the need for the rules of hooks and with support for conditional hooks.**

## Status

vyre is in **alpha**. The runtime, compiler, and SSR/hydration paths work and are
covered by a large test suite, but APIs may still change and some features are
still landing. It is ready to experiment with — not yet recommended for
production.

## Why vyre

- **The React API, minus the footguns.** `useState`, `useReducer`, `useEffect`,
  `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useId`,
  `useImperativeHandle`, `useTransition`, `useDeferredValue`,
  `useSyncExternalStore`, `useActionState`, `useFormStatus`, `useOptimistic`,
  `createContext`/`useContext`, `memo`, portals, `Suspense`, and `startTransition`
  all behave the way you expect. **Class components and server components are
  intentionally not supported.**

- **Conditional hooks — no rules of hooks.** The compiler gives every hook call
  site a stable slot identity, so hook order can't desync. Guard a hook behind an
  `if`, place it after an early `return`, or call it conditionally — it just
  works.

- **Fast by default.** Components compile to cloned templates with surgical
  updates instead of a virtual DOM.

- **Real DOM events.** vyre uses native, delegated DOM events — not a synthetic
  event system — so event behavior matches the platform.

- **TypeScript-first.** `.tsrx` lets your TypeScript setup live right next to the
  UI it feeds, with full type-checking and editor support.

## Quick start

### Install

```bash
pnpm add vyre vite-plugin-vyre
```

Add the plugin to your Vite config:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { vyre } from 'vyre/compiler/vite';

export default defineConfig({
  plugins: [vyre()],
});
```

> `vite-plugin-vyre` is the optional metaframework (dev SSR, routing, hydrate).
> For a plain SPA you only need the `vyre()` compiler plugin shown above.

### Mount

```ts
// main.ts
import { createRoot } from 'vyre';
import { App } from './App.tsrx';

const root = createRoot(document.getElementById('root')!);
root.render(App, { title: 'Hello world!' });
```

### Server render + hydrate

```ts
// entry-server.ts
import { render } from 'vyre/server';
import { App } from './App.tsrx';

export async function renderApp() {
  const { head, body, css } = await render(App);
  return { head, body, css };
}
```

```ts
// entry-client.ts
import { hydrate } from 'vyre';
import { App } from './App.tsrx';

hydrate(App, document.getElementById('app')!);
```

## Core syntax

### Components

A component is a function. Return a single JSX root directly, or open a `@{ ... }`
setup scope when TypeScript setup (hooks, locals) sits next to the output. The
scope ends with one output node — a JSX element or fragment.

```tsrx
import { useState } from 'vyre';

export function Counter() @{
  const [count, setCount] = useState(0);

  <button onClick={() => setCount(count + 1)}>
    {'Count: ' + count as string}
  </button>
}
```

Dynamic text holes are written `{expr as string}`. Events are ordinary JSX event
props (`onClick`, `onInput`, …) backed by native, delegated DOM events.

### State and effects

```tsrx
import { useState, useEffect } from 'vyre';

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
import { useState, useEffect } from 'vyre';

export function Panel(props) @{
  const [n, setN] = useState(0);

  // Early return BEFORE a hook — fine in vyre. Each hook call site has a stable
  // compiler-assigned slot, so render order can't desync the hooks.
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

This is a pnpm monorepo. The publishable packages are:

- **[`vyre`](./packages/vyre)** — the runtime **and** the compiler. Template-clone
  rendering, the React-shaped hook API, server (SSR) and client (hydration) entry
  points, plus the TSRX→vyre compiler exposed at `vyre/compiler` (and
  `vyre/compiler/vite` for the build transform).
- **[`vite-plugin-vyre`](./packages/vite-plugin-vyre)** — the metaframework plugin:
  dev SSR, routing, and hydration wiring for full vyre apps.

## Development

vyre uses [pnpm](https://pnpm.io) for package management and workspace scripts.

```bash
pnpm install      # install workspace dependencies
pnpm test         # run the test suite
pnpm typecheck    # type-check the packages
pnpm format       # format with Prettier
```

### Playground

A live playground under [`playground/vyre`](./playground/vyre) demos state, keyed
lists, conditional rendering, `@switch`, dynamic components, and suspense:

```bash
pnpm --filter vyre-playground dev
```

## License

MIT
