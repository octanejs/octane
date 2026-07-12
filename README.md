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

Octane is a fast, TypeScript-first UI framework — the successor to
[Inferno](https://github.com/infernojs/inferno), the React-like library built to
stay close to the speed of hand-written DOM code. Octane keeps that goal and
modernizes everything around it: you write with the React API you already know,
but a compiler removes the virtual DOM, Suspense waterfalls, rules-of-hooks
bookkeeping, and hand-maintained dependency arrays before your app ships.

If you know React, you already know Octane. `useState`, `useEffect`, `memo`,
context, portals, Suspense, transitions — same API, same mental model, checked
the boring way against 2,200+ conformance tests lifted straight from
`facebook/react`. Your React knowledge just works.

Speed was never going to be enough on its own, though. The reason to reach for
Octane is the day-to-day feel:

- **Write the JSX you already write.** Standard `.tsx`/`.jsx` runs out of the
  box — paste a component from the React docs and it works, hooks and all.
- **Or opt into `.tsrx` for more.** TSRX is the spiritual successor to JSX: the
  same mental model, plus template directives (`@if`, `@for`, `@switch`, `@try`)
  that compile to keyed fast paths, and an `@{ … }` shorthand that lets setup sit
  right next to the output. Mix both dialects in one app and import freely across
  the boundary — you choose per component.
- **Write the closure, not its dependency list.** Omit the array from
  `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`,
  or `useImperativeHandle` and the compiler derives it from lexical captures,
  including knowledge of stable setters, dispatchers, refs, state getters, and
  effect events. It is the no-bookkeeping dependency DX associated with signal
  frameworks, while keeping the hooks model you already know. Explicit arrays
  remain authoritative; pass `null` when you intentionally want every render.
- **No rules of hooks.** Hooks are tracked by call site, not call order, so a
  hook can live inside an `if` or after an early return — the usual React
  footguns simply aren't there. The one rule that remains is enforced for you:
  a hook in a plain JS loop is a compile error (every iteration would share one
  call-site slot) — loop with the keyed `@for` directive instead, where each
  item gets its own hook state.
- **The platform, not a reimplementation of it.** Real delegated DOM events,
  controlled form components on native events (React's `value`/`checked`
  semantics — `onInput` per keystroke, no synthetic `onChange`), and
  refs-as-props (`ref={cb}`, `ref={obj}`, even `ref={[a, b]}`) — no synthetic
  layer second-guessing the browser.
- **No virtual DOM.** Components re-render like React, but a compiled render path
  and a LIS-based keyed reconciler keep the runtime overhead minimal.

Created by [Dominic Gannaway](https://github.com/trueadm), who also created
Inferno and has worked on React, Lexical, Ripple, and Svelte.

## Status

Octane is currently in alpha development.

## At a glance

- **The full React hook API** — `useState`, `useEffect`, `useMemo`, `useRef`,
  `useId`, `useTransition`, `useDeferredValue`, `use`, and the rest — with the
  same effect ordering and Suspense semantics, plus compiler-inferred dependency
  lists when you omit them.
- **Fully async** — transitions, deferred values, and `<Activity>`.
- **Streaming SSR and byte-stable hydration** — out-of-order Suspense flushing
  over Node or web streams, or buffered/static rendering when you want it.
- **Errors handled two ways** — the `<ErrorBoundary>` component, or `@try` /
  `@catch` in TSRX.
- **`class` / `className` composes clsx-style** everywhere — strings, arrays,
  objects, and nesting, at every apply site.
- **Refs as props**, including array composition (`ref={[a, b]}`) — no
  `forwardRef`. Works with spreads, SSR, and hydration.
- **Controlled form components on native events** — `value`/`checked` follow
  React's controlled semantics exactly; `defaultValue`/`defaultChecked` opt out.
  The per-keystroke handler is the native `onInput` (no synthetic `onChange`).

Octane is deliberately narrow where React has grown wide: **no class components,
no Server Components, no synthetic event system.** Those are choices, not gaps —
see [Differences from React](https://octanejs.dev/docs/differences-from-react).

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

Octane's SSR entry points mirror React's, so this maps onto what you already do.
`octane/server` is the request-time renderer (React's `react-dom/server`) — pick
buffered (`renderToString`) or streaming (`renderToPipeableStream` /
`renderToReadableStream`); `octane/static` is the static-generation renderer
(`react-dom/static`). Buffered renders hand back `{ html, css }` — hoisted
`<title>`/`<meta>`/`<link>` fold into `html` (as in React 19), and `css` is the
deduped scoped-`<style>` tags, which the client's `injectStyle` matches on
hydration so styles cross the boundary exactly once.

```ts
// entry-server.ts
import { renderToString } from 'octane/server'; // sync; fallbacks for suspended boundaries
import { prerender } from 'octane/static'; // async; awaits all Suspense data
import { App } from './App.tsrx';

export async function renderApp() {
  const { html, css } = await prerender(App); // { html, css }
  return { html, css };
}
```

| API | Module | Await | Suspense boundary that suspends |
| --- | --- | --- | --- |
| `renderToString(el, props?, opts?)` | `octane/server` | no (sync) | renders its `@pending` fallback |
| `renderToStaticMarkup(el, props?, opts?)` | `octane/server` | no (sync) | fallback; **no** hydration markers/seeds |
| `renderToPipeableStream(el, props?, opts?)` | `octane/server` | streams | shell ships the fallback; boundary streams in when it settles |
| `renderToReadableStream(el, props?, opts?)` | `octane/server` | streams | shell ships the fallback; boundary streams in when it settles |
| `prerender(el, props?, opts?)` | `octane/static` | yes | awaits data, renders the success arm |

The buffered/static renderers accept a `RenderOptions` (CSP `nonce`, an
`AbortSignal`, a per-render `timeoutMs`). See [docs/ssr.md](./docs/ssr.md) for the
full server guide (Suspense on the server, head hoisting, `module server` RPC) and
the SSR roadmap.

### Streaming SSR

This is the fast-first-paint story, and it works the way React's does.
`renderToPipeableStream` (Node streams) and `renderToReadableStream` (web streams)
flush a **shell** immediately — the full page, with `@pending` fallbacks standing
in for anything still suspended — so the browser paints without waiting on your
slowest data. Each Suspense boundary then streams in **out of order** the moment
its data settles, as a hidden segment plus a tiny inline swap script. When the
client hydrates, `hydrateRoot` adopts the swapped-in DOM byte-for-byte, per-boundary
`use()` seeds included — no re-render, no flash.

```ts
// entry-server.ts (Node)
import { renderToPipeableStream } from 'octane/server';
import { App } from './App.tsrx';

export function renderApp(res) {
  const { pipe } = renderToPipeableStream(App, undefined, {
    onShellReady() {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html');
      pipe(res); // shell flushes now; boundaries stream in behind it
    },
    onShellError(err) {
      res.statusCode = 500;
      res.end('<!doctype html>Server error');
    },
  });
}
```

`renderToReadableStream` returns a `Promise<ReadableStream<Uint8Array>>` that
resolves once the shell is ready (rejects on a shell error); the stream carries an
`allReady` promise that settles when every boundary has flushed. Both accept a
`StreamOptions` (`RenderOptions` plus `onShellReady()`, `onShellError(err)`, and
`onAllReady()`). `@octanejs/vite-plugin` renders through `renderToReadableStream`
by default.

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
  });

  <p>{'Elapsed: ' + seconds}</p>
}
```

Dependency arrays are optional in Octane. When one is omitted from
`useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`,
or `useImperativeHandle`, the compiler derives it from the callback's reactive
captures. It understands member reads and stable hook results such as state
setters, reducer dispatchers, refs, state getters, and `useEffectEvent`.

Explicit arrays keep their React meaning and are never rewritten. Pass `null`
for the uncommon every-render form:

```jsx
useEffect(() => sync(room.id)); // inferred from the closure
useEffect(() => initialize(), []); // explicitly mount/reconnect only
useEffect(() => sync(room.id), [room.id]); // explicit dependencies
useEffect(() => measure(), null); // explicitly after every commit
```

`useState` and `useReducer` also expose an optional third tuple member: a stable
getter for the hook's latest state. It is useful in async callbacks and other
long-lived closures where capturing the render's state value would go stale:

```jsx
export function SaveButton() @{
  const [draft, setDraft, getDraft] = useState('');

  const saveLater = async () => {
    await waitForConnection();
    await save(getDraft()); // the latest draft, not the render that started this callback
  };

  <button onClick={saveLater}>{'Save ' + draft}</button>
}
```

The compiler emits a getter-enabled hook only when the third tuple member can
be observed. Ordinary `[state, setState]` and `[state, dispatch]` destructures
keep the existing two-item runtime path and allocate no getter. The getter reads
the latest scheduled hook value, which may be newer than the currently committed
DOM during a pending render.

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
  });

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

### Class composition

`class` (and its alias `className`) accepts more than a string. Octane composes the
value the same way the `clsx` / `classnames` libraries do — from strings, numbers,
arrays, objects, and any nesting of those — so you can build a class list inline
without a helper. Falsy parts (`false`, `0`, `null`, `undefined`, `''`) drop out;
object keys are kept when their value is truthy.

```jsx
export function Button(props) @{
  <button
    class={[
      'btn',
      props.size,                       // 'btn lg'
      { active: props.active, disabled: props.disabled },
      props.extra,                      // string | array | object | falsy
    ]}
  >
    {props.label as string}
  </button>
}
```

Composition is native to the runtime (no dependency) and works everywhere a class
does: dynamic bindings, `{...spread}` props, SVG elements, scoped-`<style>` components
(the scope hash is appended after your classes), and server rendering (the SSR output
and client render compose byte-identically, so hydration never mismatches).

> Unlike React — which coerces `className={['a', 'b']}` to the string `"a,b"` — this is
> a deliberate Octane convenience. A plain string still takes the fast path.

## Documentation

The full docs live at **[octanejs.dev](https://octanejs.dev)**, a site built with
Octane itself. Good places to start:

- **[Quick start](https://octanejs.dev/docs/quick-start)** — install, mount, and
  the `.tsrx` essentials.
- **[TSRX vs TSX/JSX](https://octanejs.dev/docs/tsrx-vs-tsx)** — when to reach for
  each dialect and exactly what TSRX unlocks: compiled `@for` collections,
  template control flow, and text holes.
- **[Differences from React](https://octanejs.dev/docs/differences-from-react)** —
  the deliberate divergences, and why everything else matching React is the point.
- **[Bindings](https://octanejs.dev/docs/bindings)** — the `@octanejs/*` ports of
  the React ecosystem.

## Packages

This is a pnpm monorepo with twenty-one publishable packages — the core
runtime+compiler, the metaframework plugin (and its Vercel adapter), an MCP
server, and seventeen framework bindings:

- [`octane`](./packages/octane) is the runtime and the compiler together. It covers
  rendering, the hook API, the server (SSR) and client (hydration) entry points,
  and the compiler itself, which is exposed at `octane/compiler` (and
  `octane/compiler/vite` for the build transform).
- [`@octanejs/vite-plugin`](./packages/vite-plugin-octane) is the optional metaframework
  plugin, with dev SSR, routing, and hydration wiring for full apps;
  [`@octanejs/adapter-vercel`](./packages/adapter-vercel) deploys its build
  output to Vercel.
- [`@octanejs/mcp-server`](./packages/octane-mcp-server) exposes octane docs and
  compile tooling to AI agents over MCP.
- The `@octanejs/*` framework bindings — each an octane port of a React library:
  [`zustand`](./packages/zustand), [`jotai`](./packages/jotai),
  [`query`](./packages/tanstack-query), [`motion`](./packages/motion),
  [`stylex`](./packages/stylex), [`router`](./packages/tanstack-router),
  [`table`](./packages/tanstack-table), [`virtual`](./packages/tanstack-virtual),
  [`lexical`](./packages/lexical), [`floating-ui`](./packages/floating-ui),
  [`radix`](./packages/radix), [`hook-form`](./packages/hook-form),
  [`base-ui`](./packages/base-ui), [`recharts`](./packages/recharts),
  [`redux`](./packages/redux), [`testing-library`](./packages/testing-library),
  and [`mdx`](./packages/mdx).
  Parity varies by package — some are behaviorally complete, others are
  explicitly partial or alpha. [`docs/bindings-status.md`](./docs/bindings-status.md)
  is the generated per-package status table (upstream version, supported
  surface, known divergences, SSR/hydration, last parity verification), sourced
  from each package's `status.json` and checked in CI.

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
