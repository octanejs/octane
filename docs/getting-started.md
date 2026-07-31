# Getting started

Everything you need to get an Octane app running: install, wire up a build tool,
mount, and (when you want it) render on the server and hydrate on the client.
The hosted version of this material, with more prose around it, lives at
[octanejs.dev/docs/quick-start](https://octanejs.dev/docs/quick-start).

## Install

Octane's published packages require Node.js 22 or newer.

```bash
pnpm add octane @octanejs/vite-plugin
```

The CLI can wire it up instead, including the TypeScript settings `.tsrx` needs:

```bash
pnpm dlx @octanejs/cli init
```

## Build tools

### Vite

For any Vite app, add Octane's Vite integration:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],
});
```

Without an `octane.config.ts`, the plugin compiles a normal client-only SPA and
leaves Vite's HTML handling alone. Add an Octane config with routes to turn on
routing, streaming SSR, hydration, and client/server production builds.

### Rspack

Use the low-level Rspack plugin when you own the application shell and entries
yourself:

```bash
pnpm add -D @rspack/core @octanejs/rspack-plugin
```

```js
// rspack.config.mjs
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';

export default {
	entry: './src/main.tsrx',
	plugins: [new OctaneRspackPlugin()],
};
```

### Rsbuild

Use the Rsbuild plugin for the full Octane app layer: routing, streaming dev SSR,
hydration entries, client/server production environments, preview, and deployment
adapters.

```bash
pnpm add @octanejs/rsbuild-plugin
pnpm add -D @rsbuild/core
```

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginOctane } from '@octanejs/rsbuild-plugin';

export default defineConfig({
	plugins: [pluginOctane()],
});
```

The Vite setup above gives you these same app-level features. The
[build tools guide](https://octanejs.dev/docs/build-tools) covers SPA, SSR,
client/server targets, HMR, and config in depth.

## Mount

```ts
// main.ts
import { createRoot } from 'octane';
import { App } from './App.tsrx';

const root = createRoot(document.getElementById('root')!);
root.render(App, { title: 'Hello world!' });
```

`root.render(<App />)` works too. The first `render()` mounts synchronously.

## Server render and hydrate

Octane's SSR entry points mirror React's, so this maps onto what you already do.
`octane/server` is the request-time renderer (React's `react-dom/server`): pick
buffered (`renderToString`) or streaming (`renderToPipeableStream` /
`renderToReadableStream`). `octane/static` is the static-generation renderer
(React's `react-dom/static`).

Buffered renders hand back `{ html, css }`. Hoisted `<title>`, `<meta>`, and
`<link>` fold into `html` (as in React 19), and `css` is the deduped scoped
`<style>` tags, which the client's `injectStyle` matches during hydration so
styles cross the boundary exactly once.

```ts
// entry-server.ts
import { renderToString } from 'octane/server'; // sync; fallbacks for suspended boundaries
import { prerender } from 'octane/static'; // async; awaits all Suspense data
import { App } from './App.tsrx';

export async function renderApp() {
	const { html, css } = await prerender(App);
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

The buffered and static renderers accept `RenderOptions`: a CSP `nonce`, a
root-local `identifierPrefix`, an `AbortSignal`, and a per-render `timeoutMs`.
[docs/ssr.md](./ssr.md) is the full server guide, covering Suspense on the
server, head hoisting, and `module server` RPC.

## Streaming SSR

This is the fast-first-paint story, and it works the way React's does.
`renderToPipeableStream` (Node streams) and `renderToReadableStream` (web
streams) flush a **shell** immediately: the full page, with `@pending` fallbacks
standing in for anything still suspended, so the browser paints without waiting
on your slowest data. Each Suspense boundary then streams in out of order as its
data settles, as a hidden segment plus a small inline swap script. When the
client hydrates, `hydrateRoot` adopts the swapped-in DOM byte for byte, including
per-boundary `use()` seeds, so there is no re-render and no flash.

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

```ts
// entry-client.ts
import { hydrateRoot } from 'octane';
import { App } from './App.tsrx';

hydrateRoot(document.getElementById('app')!, App);
```

`renderToReadableStream` returns a `Promise<ReadableStream<Uint8Array>>` that
resolves once the shell is ready and rejects on a shell error. It is pull-driven,
honors consumer cancellation, and carries an `allReady` promise that settles when
every boundary chunk has been accepted under backpressure, so consume the stream
concurrently rather than awaiting `allReady` before reading. The Node stream
honors `write(false)`/`drain` and cancels on destination error or close. Both
accept `StreamOptions`: `RenderOptions` plus `onShellReady()`,
`onShellError(err)`, and `onAllReady()`. The Vite and Rsbuild metaframework
plugins render through `renderToReadableStream` by default.

## Deferred hydration

Use `<Hydrate>` for server-rendered content that should stay visible but does not
need to become interactive right away. `when` chooses the activation strategy,
`split` controls compiler extraction (on by default), and `prefetch` can prepare
the generated child chunk or other resources ahead of activation.

```tsrx
import { Hydrate } from 'octane';
import { visible } from 'octane/hydration';

export function ProductPage() @{
	<Hydrate when={visible({ rootMargin: '400px' })}>
		<Reviews />
	</Hydrate>
}
```

The initial server DOM is adopted in place and stays inert until the strategy
opens the boundary. See
[docs/deferred-hydration.md](./deferred-hydration.md) for strategies, code
splitting, prefetching, fallbacks, and nesting behavior.

## Profiling

Pass `profile: true` to the Vite, Rspack, or Rsbuild integration to get a client
profiling build with component timing, render counts and causes,
schedule-to-render delay, Chrome Performance tracks, and a bounded console API.
Normal production builds omit the compiler metadata and tree-shake the recorder
unless application code imports `octane/profiling` directly. The
[profiling guide](https://octanejs.dev/docs/profiling) has the details.

## What production builds do on their own

Production client compilation reuses conservative same-module pure component
regions and keyed lists by inferred lexical dependencies, using
React-Compiler-style strict-identity snapshots and the normal context-aware
Block/keyed-list machinery. There is nothing to configure and no flag to learn:
the proof fails closed, so HMR, dev, profiling, and server builds use normal
reconciliation, and effects, refs, mutable ambient reads, custom comparators, and
Suspense/transition boundaries keep their authored every-render behavior. Caching
render-used imported calculations and their descriptor output is a later phase
that ships together with per-key descriptor reuse.
