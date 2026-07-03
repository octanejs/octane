# Skill: Set up Octane SSR and hydration

Use this when adding server-side rendering to an Octane app.

## The API

```ts
import { renderToString } from 'octane/server';

const { head, body, css } = await renderToString(App, props, {
	signal: request.signal,
	nonce: cspNonce,
	timeoutMs: 5000,
});
```

- `body`: rendered HTML with hydration markers, plus an inline suspense seed
  script when anything suspended.
- `head`: hoisted `<title>/<meta>/<link>` markup; place inside `<head>`.
- `css`: deduped `<style data-octane>` tags from scoped styles; place after
  `head`.
- Options are optional: `signal` aborts the render with the request, `nonce`
  stamps CSP nonces on the emitted inline tags, `timeoutMs` bounds how long a
  `use(thenable)` may take to settle (global default via
  `setSsrSuspenseTimeout`).
- `render` is a deprecated alias of `renderToString`.

On the client:

```ts
import { hydrateRoot } from 'octane';
hydrateRoot(document.getElementById('app')!, App, props);
```

Pass the same component and props on both sides. `useId` and scoped styles are
hydration-stable; the client adopts server DOM instead of rebuilding it.

## Two integration paths

1. **Vite plugin (dev SSR + routing)**: `@octanejs/vite-plugin` matches routes
   from `octane.config.ts`, renders pages into `index.html` at
   `<!--ssr-head-->` / `<!--ssr-body-->`, and wires hydration automatically.
   Production server output is not generated yet; for production SSR today use
   path 2.
2. **Custom server**: write `entry-server.ts` exporting a function that calls
   `renderToString` and splices the result into your HTML template, and
   `entry-client.ts` calling `hydrateRoot`. Serialize app data (for example a
   dehydrated query-client cache) into your own inline JSON script and read it
   before hydrating.

## Data and Suspense on the server

`use(promise)` suspends a pass; `renderToString` awaits it and re-renders, so
`@try { } @pending { }` boundaries resolve to their success arm in the emitted
HTML. Resolved values serialize into the seed script and hydration consumes
them without re-fetching. For query-style data, prefetch into a cache before
rendering and dehydrate it yourself.

## Constraints to remember

- Effects never run on the server; state hooks return initial values;
  `useSyncExternalStore` uses `getServerSnapshot`.
- Server components must be compiled by the Octane compiler in server mode;
  you cannot feed client-compiled output to `renderToString`.
- Output is buffered, not streamed: send it as one response.
- Render errors reject the promise unless an `ErrorBoundary`/`@catch` inside
  the tree handles them; map rejections to HTTP status codes in your server.
