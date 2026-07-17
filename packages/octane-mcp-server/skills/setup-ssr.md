# Skill: Set up Octane SSR and hydration

Use this when adding server-side rendering to an Octane app.

## The API

The entry points mirror React. `octane/server` (`react-dom/server`) has
`renderToString` (sync), `renderToStaticMarkup` (non-hydratable), and the two
streaming renderers `renderToPipeableStream` (Node streams) and
`renderToReadableStream` (web streams); `octane/static` (`react-dom/static`)
has `prerender` (async, awaits Suspense data). The buffered renderers return
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
  bounds how long a `use(thenable)` may take to settle (async renders; global
  default via `setSsrSuspenseTimeout`); `onError` observes render errors.

### Streaming

`renderToPipeableStream(App, props?, options?)` returns `{ pipe, abort }`; the
shell — the full page with `@pending` fallbacks for anything still suspended —
flushes immediately, then each Suspense boundary streams out of order as a
hidden segment plus an inline swap script when its data settles.
`renderToReadableStream` is the same engine over web streams: it resolves with
a `ReadableStream<Uint8Array>` once the shell is ready and rejects on a shell
error; consume the stream concurrently rather than awaiting its `allReady`
promise first. `StreamOptions` extends `RenderOptions` with `onShellReady()`,
`onShellError(err)`, and `onAllReady()`. `hydrateRoot` adopts streamed-in DOM
byte-for-byte, including per-boundary `use()` value or rejection seeds.

On the client:

```ts
import { hydrateRoot } from 'octane';
hydrateRoot(document.getElementById('app')!, App, props);
```

Pass the same component and props on both sides. `useId` and scoped styles are
hydration-stable; the client adopts server DOM instead of rebuilding it.

## Two integration paths

1. **Vite plugin (routing + dev and production SSR)**: `@octanejs/vite-plugin`
   matches routes from `octane.config.ts`, streams pages with
   `renderToReadableStream()` into `index.html` around `<!--ssr-head-->` /
   `<!--ssr-body-->`, and wires hydration automatically. In production,
   `vite build` emits hashed client assets in `dist/client` plus a
   self-contained SSR server at `dist/server/entry.js` (exports
   `handler`/`nodeHandler`; preview with `octane-preview`);
   `server.render: 'buffered'` switches it to the await-everything `prerender`.
   A deploy adapter can restructure the output for a host — for example
   `adapter: vercel()` from `@octanejs/adapter-vercel` emits Vercel's Build
   Output API.
2. **Custom server**: write `entry-server.ts` exporting a function that calls
   `prerender()` (or `renderToString()`, or a streaming renderer) and splices
   the result into your HTML template, and `entry-client.ts` calling
   `hydrateRoot`. Serialize app data (for example a dehydrated query-client
   cache) into your own inline JSON script and read it before hydrating.

## Data and Suspense on the server

`use(promise)` suspends a pass; `prerender()` awaits it and re-renders, so
`@try { } @pending { }` boundaries resolve to their success arm in the emitted
HTML, while the streaming renderers flush the fallback in the shell and stream
the resolved boundary behind it. Resolved values serialize into the seed script
and hydration consumes them without re-fetching. For query-style data, prefetch
into a cache before rendering and dehydrate it yourself.

## Constraints to remember

- Effects never run on the server; state hooks return initial values;
  `useSyncExternalStore` uses `getServerSnapshot`.
- Server components must be compiled by the Octane compiler in server mode;
  you cannot feed client-compiled output to the renderers.
- Hydration adopts the whole tree in one synchronous pass (no selective or
  progressive hydration), and head elements hoisted from inside a streamed
  Suspense boundary are re-created on hydration rather than shipped in the
  stream.
- Render errors reject the promise unless an `ErrorBoundary`/`@catch` inside
  the tree handles them; map rejections to HTTP status codes in your server.
  With streaming, a recoverable error inside Suspense content keeps the emitted
  fallback and marks only that boundary for client rendering.
