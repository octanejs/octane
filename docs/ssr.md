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
`mode: 'server'` (`@octanejs/vite-plugin` handles this automatically; SSR module
loading through Vite picks the server transform automatically).

## API

The three buffered renderers return `RenderResult = { html, css }`:

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

### `renderToPipeableStream(component, props?, options?)` — `octane/server`

Streaming SSR over Node-style streams (React `react-dom/server` parity, Octane
argument convention). Returns `{ pipe, abort }`; chunks buffer until
`pipe(destination)` is called. The **shell** — the full page with `@pending`
fallbacks for anything still suspended — flushes immediately; each Suspense
boundary then streams **out of order** as a hidden segment plus an inline
`$OCTRC` swap script when its data settles. Scoped styles flush with the shell
(before the body markup) and per-wave with their segment; hoisted head elements
render with the shell only. `hydrateRoot` on the client adopts the swapped-in
DOM byte-for-byte, including per-boundary `use()` value or rejection seeds (a
rejected boundary hydrates directly into its server-rendered `@catch` arm). Node
destinations honor `write(false)`/`drain`; destination errors or an early close
cancel the render.

A Promise or Context may also be rendered directly as a React-19-style Usable
node; nested Usables are unwrapped recursively. A pending Usable outside a
Suspense boundary delays the shell until it resolves. Streamed replacements are
parsed in their real HTML, table/select, SVG, or MathML context, so revealing a
boundary preserves both valid structure and namespace identity.

`StreamOptions` extends `RenderOptions` with `onShellReady()`,
`onShellError(err)`, and `onAllReady()`. Calling `abort(reason)` after the shell
reports the reason through `onError`, preserves the fallback for client
recovery, closes the destination, and invokes `onAllReady` once as the terminal
readiness notification.

### `renderToReadableStream(component, props?, options?)` — `octane/server`

The same streaming engine over web streams: resolves with a
`ReadableStream<Uint8Array>` once the shell is ready (rejects on a shell error).
Output is pull-driven and bounded by consumer backpressure; cancelling the
reader cancels the render. The stream's `allReady` promise settles when every
boundary chunk has been accepted by the consumer, so consume the stream
concurrently rather than awaiting `allReady` before reading. Same
`StreamOptions`.

### `RenderOptions`

- `nonce?: string` — CSP nonce stamped on every inline tag the renderer emits
  (style, suspense seed, swap-runtime, and recovery scripts). Applies to every
  buffered and streaming renderer.
- `onError?: (error) => void` — called with any error thrown during the render,
  before it propagates.
- `identifierPrefix?: string` — namespaces root-local `useId` values. Pass the
  same value to `hydrateRoot` and use distinct prefixes for sibling roots.
- `signal?: AbortSignal` — abort a suspended async/streaming render when the
  request dies; pending promises reject with `signal.reason` and streams cancel.
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
- `<Activity mode="visible">` renders its children normally. A hidden Activity
  does not evaluate or serialize its children on the server; hydratable output
  retains only an empty internal range so `hydrateRoot` can build the preserved
  hidden client tree without disturbing neighboring server DOM. Static markup
  emits nothing for the hidden Activity.
- Suspense: an unresolved `use(thenable)` renders the nearest `@pending`
  fallback and suspends the pass. `prerender` awaits what suspended, caches the
  resolved values, and re-renders. To avoid re-serializing the whole static bulk
  on every level of a waterfall, it re-runs only the suspending **subtrees**
  between canonical full passes (a deep waterfall costs ~2 full passes + cheap
  subtree re-runs, not D+1 full passes). The emitted HTML always comes from a
  full pass, so hydration byte-format is identical either way. Resolved values
  and versioned rejection metadata are serialized into the seed script so
  hydration does not re-fetch, re-suspend, or replace a server `@catch` arm.
  Rejection records preserve primitive and JSON-safe plain-object reasons plus
  Error names, messages, and enumerable custom fields. Cyclic fields are
  bounded and marked, while hostile or opaque values degrade to fixed safe
  markers instead of breaking the response. Rejection metadata lives outside
  fulfilled values, and the undefined wire encoding escapes its string prefix,
  so sentinel-shaped user data remains ordinary data.
- `useId` counters are root-local. Server output is hydration-stable when the
  client passes the same `identifierPrefix`; distinct sibling roots should use
  distinct prefixes.
- Server hooks are render-only: state and reducers process bounded render-phase
  updates and expose the same current-state getter as the client, effects never
  run, and `useSyncExternalStore` reads `getServerSnapshot`.
- Renders are concurrency-safe: each pass saves and restores the ambient module
  state around its synchronous run, so overlapping requests cannot observe each
  other.
- Deep function-component trees retain bounded hook replay. Replay snapshots
  live outside the recursive invocation frame to reduce stack pressure; the
  conformance suite exercises a 1,000-level cold tree.

## SSR via the Vite plugin

`@octanejs/vite-plugin` gives file-based routing plus dev-server SSR: it matches
a route from `octane.config.ts`, loads the page module through Vite's SSR
pipeline, renders it with `renderToReadableStream()` — the shell flushes as soon
as it is ready and suspended boundaries stream in behind it — into `index.html`
around `<!--ssr-body-->` (`<!--ssr-head-->` receives the hydration data script;
styles ride the stream), and injects the hydration entry. Route components
receive `{ params, url }`, and `router.preHydrate` names a client module whose
default export is awaited before `hydrateRoot` (e.g. an app router committing
its match tree). `module server` functions are executed through
`executeServerFunction`. For a custom server (see `examples/hacker-news`), write
your own `entry-server.ts` around `prerender()` or the streaming renderers and
serialize any app data (for example a dehydrated query-client cache) into your
own inline script.

On the server, page and layout props also receive `state`, the same
request-scoped `Context.state` Map middleware populated. It is deliberately not
serialized; browser hydration receives only `{ params, url }`.

In production, `vite build` emits both bundles: hashed client assets in
`dist/client` and a self-contained SSR server at `dist/server/entry.js`
(exports `handler`/`nodeHandler`, auto-boots under `node`; preview with
`octane-preview`). The production handler streams through the same engine and
emits the same hydratable shape as dev — `server.render: 'buffered'` switches
it to the await-everything `prerender`. A deploy adapter (e.g.
`@octanejs/adapter-vercel`) can restructure the output for a host:
`adapter: vercel()` in octane.config.ts emits Vercel's Build Output API under
`.vercel/output` after the build. Request abort signals reach both render modes;
the built-in Node bridge also waits for `drain` and cancels the render when the
response socket closes.

### Root boundaries, server functions, and CSP

`rootBoundary` uses importable component entries so the same pending/error UI
can be loaded by dev SSR, the production server bundle, and the browser hydrate
entry. A string selects a module's default (or first PascalCase) export; use an
`[exportName, path]` tuple for an explicit named export:

```ts
export default defineConfig({
  rootBoundary: {
    pending: '/src/RootPending.tsrx',
    catch: ['RootCatch', '/src/RootCatch.tsrx'],
  },
  // ...router
});
```

The catch component receives `{ error, reset }`; the pending component receives
no props. Paths must be Vite-root paths. `index.html` must contain exactly one
`<!--ssr-head-->` marker, one `<!--ssr-body-->` marker, and one closing `</body>`
tag; builds now fail with an actionable error when that hydration contract is
malformed.

Server functions are declared and imported in the same full-compiled `.tsrx` or
`.tsx` file. The client compiler replaces the local import with an RPC stub; dev
registers it in Vite's SSR module graph, while production adds a static server
import:

```tsrx
module server {
  import { database } from './database.js';

  export async function saveName(name: string) {
    return database.users.save({ name });
  }
}

import { saveName } from 'server';
```

Only named imports/exports are supported. Arguments and results use devalue, so
Dates, Maps, Sets, `undefined`, and cyclic values survive the round trip.

For a strict CSP, middleware can set the documented `Context.state` key. The
raw nonce is passed to the core renderer and safely attribute-escaped on the
hydration-data and hydrate-module scripts in both dev and production:

```ts
import { OCTANE_NONCE_STATE_KEY } from '@octanejs/vite-plugin';

const cspNonce = async (context, next) => {
  context.state.set(OCTANE_NONCE_STATE_KEY, crypto.randomUUID());
  return next();
};
```

## Not built yet

These are the known gaps between Octane SSR and a full streaming SSR stack:

- **Selective / progressive hydration**: `hydrateRoot` adopts the whole tree in
  one synchronous pass (and there is no synthetic event replay, by design).
- **Streamed head hoisting**: head elements hoisted from INSIDE a streamed
  Suspense boundary don't ship in the stream (the shell already flushed); the
  client re-creates them on hydration.
- **Framework-level data serialization**: only suspense seeds cross the boundary
  automatically; loader-style data APIs are app code today.
- **Error digests**: `onError` and the shell callbacks exist, but there are no
  React-style error digests; a post-shell error ends the stream with the
  affected boundaries marked for client render.
- **React Fizz document orchestration options**: core rendering deliberately
  does not own doctype/preamble insertion, bootstrap script/module lists,
  import-map construction, response headers, or `onHeaders`. Compose the
  returned stream into the surrounding document and set headers in the Vite
  plugin, adapter, or application server instead.
