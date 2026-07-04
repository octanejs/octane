# Server-side rendering

Octane ships a complete string SSR + hydration pipeline. This doc covers the
public API, how the pieces fit, and what is intentionally not built yet.

The entry points mirror React: `octane/server` is the request-time renderer
(`react-dom/server`) and `octane/static` is the static-generation renderer
(`react-dom/static`).

## Quick start

```ts
// entry-server.ts
import { prerender } from 'octane/static'; // async; awaits all Suspense data
import { App } from './App.tsrx';

export async function renderApp() {
	const { html, css } = await prerender(App, { title: 'Hi' });
	return `<!doctype html>
<html>
<head>${css}</head>
<body><div id="app">${html}</div></body>
</html>`;
}
```

```ts
// entry-client.ts
import { hydrateRoot } from 'octane';
import { App } from './App.tsrx';

hydrateRoot(document.getElementById('app')!, App, { title: 'Hi' });
```

The server build must compile components with the Octane compiler in
`mode: 'server'` (the Vite plugin and `octane/compiler/vite` handle this; SSR
module loading through Vite picks the server transform automatically).

## API

All three buffered renderers return `RenderResult = { html, css }`:

- `html` — the rendered markup, including hydration markers and, when anything
  resolved, an inline `<script type="application/json" data-octane-suspense>`
  seed that hydration consumes. Hoisted `<title>`/`<meta>`/`<link>` (rendered
  anywhere in the tree, each preceded by an adoption marker comment) are folded
  in — spliced into `<head>` when the render produced a document, else prepended
  (React-19 resource hoisting; there is no separate `head` channel).
- `css` — deduped `<style data-octane="hash">` tags collected from scoped
  `<style>` components. Place inside `<head>`. The client skips re-injecting any
  hash already present. (Kept as its own field because Octane has scoped CSS
  that React core does not.)

### `renderToString(component, props?, options?) => RenderResult` — `octane/server`

A single **synchronous** pass, no awaiting. A Suspense boundary that suspends
renders its `@pending` fallback; synchronously-resolved `use()` still seeds. Use
`prerender` when you need the data awaited.

### `renderToStaticMarkup(component, props?, options?) => RenderResult` — `octane/server`

Like `renderToString` but produces clean, **non-hydratable** HTML: no
`<!--[-->`/`<!--]-->` block markers, no head-adoption markers, no suspense seed
script. For static pages / email.

### `prerender(component, props?, options?) => Promise<RenderResult>` — `octane/static`

Awaits **all** data: every `use(thenable)` resolves and Suspense boundaries
render their success arm (or route rejection to `@catch`). Use for SSG or any
place that wants fully-resolved HTML with no client fallback.

### `RenderOptions`

- `nonce?: string` — CSP nonce stamped on every inline tag the renderer emits
  (the style tags and the suspense seed script). Applies to all three renderers.
- `onError?: (error) => void` — called with any error thrown during the render,
  before it propagates.
- `identifierPrefix?: string` — reserved for `useId` prefixing (React parity).
- `signal?: AbortSignal` — abort a suspended render when the request dies; the
  promise rejects with `signal.reason`. Async renders only (`prerender`).
- `timeoutMs?: number` — per-render override of the suspense settle deadline;
  `0` disables it. Async renders only.

### `setSsrSuspenseTimeout(ms)` / `getSsrSuspenseTimeout()`

Global default for the suspense settle deadline (10s initially). A
`use(thenable)` that never settles fails the render with a clear error instead
of hanging the request.

### `executeServerFunction(fn, body)` — `octane/server`

The metaframework's RPC executor for `module server` functions. The wire format
is devalue on both sides (so Dates/Maps/Sets/undefined/cycles round-trip): a
devalue-encoded argument array in, a devalue-encoded `{ value }` envelope out.
The Vite plugin loads it via `ssrLoadModule('octane/server')` so the executor
and the resolved server function share one SSR runtime.

## How it works

- Server-compiled components are string emitters: static HTML interleaved with
  helper calls for dynamic holes, wrapped in `<!--[-->`/`<!--]-->` hydration
  markers that the client cursor walks during `hydrateRoot`.
- Suspense: an unresolved `use(thenable)` renders the nearest `@pending`
  fallback and suspends the pass. `prerender` awaits what suspended, caches the
  resolved values, and re-renders. To avoid re-serializing the whole static bulk
  on every level of a waterfall, it re-runs only the suspending **subtrees**
  between canonical full passes (a deep waterfall costs ~2 full passes + cheap
  subtree re-runs, not D+1 full passes). The emitted HTML always comes from a
  full pass, so hydration byte-format is identical either way. Resolved values
  are serialized into the seed script so hydration does not re-fetch or
  re-suspend.
- `useId` counters reset identically on server and client, so ids are
  hydration-stable.
- Server hooks are render-only: state returns its initial value, effects never
  run, `useSyncExternalStore` reads `getServerSnapshot`.
- Renders are concurrency-safe: each pass saves and restores the ambient module
  state around its synchronous run, so overlapping requests cannot observe each
  other.

## Dev SSR via the Vite plugin

`@octanejs/vite-plugin` gives file-based routing plus dev-server SSR: it matches
a route from `octane.config.ts`, loads the page module through Vite's SSR
pipeline, calls `prerender()`, splices the result into `index.html` at
`<!--ssr-head-->` / `<!--ssr-body-->`, and injects the hydration entry. `module
server` functions are executed through `executeServerFunction`. For a custom
server (see `examples/hacker-news`), write your own `entry-server.ts` around
`prerender()` and serialize any app data (for example a dehydrated query-client
cache) into your own inline script.

## Not built yet

These are the known gaps between Octane SSR and a full streaming SSR stack:

- **Streaming** (`renderToPipeableStream` / `renderToReadableStream`): output is
  fully buffered; there is no shell-first flush or out-of-order Suspense boundary
  streaming with inline replacement scripts. This is the active next milestone.
- **Selective / progressive hydration**: `hydrateRoot` adopts the whole tree in
  one synchronous pass.
- **Framework-level data serialization**: only suspense seeds cross the boundary
  automatically; loader-style data APIs are app code today.
- **Production SSR build in the Vite plugin**: dev SSR works; the production
  server entry generation is not implemented yet.
- **Shell-ready / status callbacks**: `onError` exists, but there are no
  shell-ready callbacks or error digests; a render error rejects the promise (or
  lands in the nearest `@catch`/`ErrorBoundary`), and status codes are the host
  server's job.
