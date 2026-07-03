# Server-side rendering

Octane ships a complete string SSR + hydration pipeline. This doc covers the
public API, how the pieces fit, and what is intentionally not built yet.

## Quick start

```ts
// entry-server.ts
import { renderToString } from 'octane/server';
import { App } from './App.tsrx';

export async function renderApp() {
	const { head, body, css } = await renderToString(App, { title: 'Hi' });
	return `<!doctype html>
<html>
<head>${head}${css}</head>
<body><div id="app">${body}</div></body>
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

### `renderToString(component, props?, options?) => Promise<RenderResult>`

`RenderResult`:

- `body` — the rendered HTML, including hydration markers and, when anything
  suspended, an inline `<script type="application/json" data-octane-suspense>`
  seed that hydration consumes.
- `head` — hoisted `<title>`, `<meta>`, and `<link>` elements rendered anywhere
  in the tree, each preceded by a marker comment the client adopts on
  hydration. Place it inside `<head>`.
- `css` — deduped `<style data-octane="hash">` tags collected from scoped
  `<style>` components. Place after `head`. The client skips re-injecting any
  hash already present.

`RenderOptions`:

- `signal?: AbortSignal` — abort the render when the request dies; the promise
  rejects with `signal.reason`.
- `nonce?: string` — CSP nonce stamped on every inline tag the renderer emits
  (the style tags and the suspense seed script).
- `timeoutMs?: number` — per-render override of the suspense settle deadline;
  `0` disables it.

`render` is a deprecated alias of `renderToString`.

### `setSsrSuspenseTimeout(ms)` / `getSsrSuspenseTimeout()`

Global default for the suspense settle deadline (10s initially). A
`use(thenable)` that never settles fails the render with a clear error instead
of hanging the request.

## How it works

- Server-compiled components are string emitters: static HTML interleaved with
  helper calls for dynamic holes, wrapped in `<!--[-->`/`<!--]-->` hydration
  markers that the client cursor walks during `hydrateRoot`.
- Suspense uses whole-tree retry: an unresolved `use(thenable)` renders the
  nearest `@pending`/fallback, `renderToString` awaits everything that
  suspended, then re-renders from scratch with the resolved values cached.
  Resolved values are serialized into the seed script so hydration does not
  re-fetch or re-suspend.
- `useId` counters reset identically on server and client, so ids are
  hydration-stable.
- Server hooks are render-only: state returns its initial value, effects never
  run, `useSyncExternalStore` reads `getServerSnapshot`.
- Renders are concurrency-safe: each pass saves and restores the ambient
  module state around its synchronous run, so overlapping requests cannot
  observe each other.

## Dev SSR via the Vite plugin

`@octanejs/vite-plugin` gives file-based routing plus dev-server SSR: it
matches a route from `octane.config.ts`, loads the page module through Vite's
SSR pipeline, calls `renderToString`, splices the result into `index.html` at
`<!--ssr-head-->` / `<!--ssr-body-->`, and injects the hydration entry. For a
custom server (see `examples/hacker-news`), write your own `entry-server.ts`
around `renderToString` and serialize any app data (for example a dehydrated
query-client cache) into your own inline script.

## Not built yet

These are the known gaps between Octane SSR and a full streaming SSR stack:

- **Streaming** (`renderToPipeableStream` / `renderToReadableStream`): output
  is fully buffered; there is no shell-first flush or out-of-order Suspense
  boundary streaming with inline replacement scripts.
- **Selective / progressive hydration**: `hydrateRoot` adopts the whole tree in
  one synchronous pass.
- **Framework-level data serialization**: only suspense seeds cross the
  boundary automatically; loader-style data APIs are app code today.
- **Production SSR build in the Vite plugin**: dev SSR works; the production
  server entry generation is not implemented yet.
- **Server error hooks**: no `onError`/shell-ready callbacks or error digests;
  a render error rejects the promise (or lands in the nearest
  `@catch`/`ErrorBoundary`), and status codes are the host server's job.
