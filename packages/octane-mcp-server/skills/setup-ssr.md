# Skill: Set up Octane SSR and hydration

Use this when adding server-side rendering to an Octane app.

## The API

The entry points mirror React: `octane/server` (`react-dom/server`) has
`renderToString` (sync) and `renderToStaticMarkup`; `octane/static`
(`react-dom/static`) has `prerender` (async, awaits Suspense data). All return
`{ html, css }`.

```ts
import { prerender } from 'octane/static';

const { html, css } = await prerender(App, props, {
	signal: request.signal,
	nonce: cspNonce,
	timeoutMs: 5000,
});
```

- `html`: rendered markup with hydration markers, plus an inline suspense seed
  script when anything resolved. Hoisted `<title>/<meta>/<link>` fold in
  (spliced into `<head>` if present, else prepended).
- `css`: deduped `<style data-octane>` tags from scoped styles; place inside
  `<head>`.
- Use `renderToString` (from `octane/server`) for a single synchronous pass that
  leaves `@pending` fallbacks in place; use `prerender` to await the data.
- Options are optional: `nonce` stamps CSP nonces on the emitted inline tags (all
  renderers); `signal` aborts a suspended render with the request and `timeoutMs`
  bounds how long a `use(thenable)` may take to settle (async `prerender`; global
  default via `setSsrSuspenseTimeout`); `onError` observes render errors.

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
   `prerender()` (or `renderToString()`) and splices the result into your HTML template, and
   `entry-client.ts` calling `hydrateRoot`. Serialize app data (for example a
   dehydrated query-client cache) into your own inline JSON script and read it
   before hydrating.

## Data and Suspense on the server

`use(promise)` suspends a pass; `prerender()` awaits it and re-renders, so
`@try { } @pending { }` boundaries resolve to their success arm in the emitted
HTML. Resolved values serialize into the seed script and hydration consumes
them without re-fetching. For query-style data, prefetch into a cache before
rendering and dehydrate it yourself.

## Constraints to remember

- Effects never run on the server; state hooks return initial values;
  `useSyncExternalStore` uses `getServerSnapshot`.
- Server components must be compiled by the Octane compiler in server mode;
  you cannot feed client-compiled output to the renderers.
- Output is buffered, not streamed: send it as one response.
- Render errors reject the promise unless an `ErrorBoundary`/`@catch` inside
  the tree handles them; map rejections to HTTP status codes in your server.
