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

Serve matching server and client compiler output. Signal control identities are
derived from authored source sites, not generated branch or loop helper names;
mixing HTML and client assets from different compiler/site-identity versions is
not a supported hydration boundary. Deploy and invalidate cached HTML/assets as
one matching build.

Subtrees can defer activation through [`<Hydrate>`](./deferred-hydration.md),
including native interaction capture and replay. `independent` boundaries can
activate without evaluating or hydrating their lexical parent, but their
activation still uses `hydrateRoot` and the renderer. The generated app bootstrap
also hydrates the composed root; an islands-only route that omits the shell's
client graph remains [proposed](./hydration-islands-plan.md).

If another renderer or an independent stream owns part of the server-rendered
DOM, use a permanent-static `<Hydrate split={false} when={never()}>` boundary to
preserve that range and `attachBehaviorRoot` from `octane/behavior` to attach
behavior without claiming reconciliation ownership. The
[behavior-only roots and external ownership guide](./deferred-hydration.md#behavior-only-roots-and-external-ownership)
covers range readiness, nested owners, delegated native interactions, and
disposal.

Fixed native presentation can also be authored once and adopted without the
renderer through [compiled DOM bindings](./deferred-hydration.md#compiled-presentation-on-existing-dom).
This updates declared properties on matching existing SSR nodes; structural
rendering and application event ownership remain separate.

### Stream data with signals

Use `query$` from `octane/signals` for data that the page needs. Read it with
`.get()` inside `@try`/`@pending`/`@catch`. While a query is waiting, the server
sends the pending content. When its first value arrives, the server sends the
ready HTML for that boundary. Separate boundaries let a fast section appear
without waiting for a slower one.

```tsrx
import 'octane/signals';
import { title$, messages$ } from './chat-data';

export function Chat() @{
	<main>
		@try {
			<h1>{title$.get() as string}</h1>
		} @pending {
			<h1>Opening chat…</h1>
		} @catch {
			<h1>Could not load the title.</h1>
		}
		@try {
			<ul>
				@for (const message of messages$.get(); key message.id) {
					<li>{message.text as string}</li>
				}
			</ul>
		} @pending {
			<p>Loading messages…</p>
		} @catch {
			<p role="alert">Could not load messages.</p>
		}
	</main>
}
```

Here `chat-data` is your application's compiled data module: `title$` is a
`query$` returning a string, and `messages$` is a `query$` returning a list of
`{ id, text }` records. For multiple values, make the loader an async iterable
and pass `{ kind: 'stream' }` to `query$`. Each yield replaces the query's whole
value; it does not append to an array automatically. See the
[complete page and loader example](https://octanejs.dev/docs/signals#streaming-example).

The standard Octane fullstack host connects query results to the browser
automatically. It can receive them before the query module loads, so activating
the matching view does not start the same initial request again. A new selection
or an explicit refresh can still start a new request.

**Later yields carry data, not replacement HTML on every yield.** An active
view or binding displays those values. A deferred view keeps its initial server
HTML until activation, then adopts those nodes and catches up to the live data.
A stored ready snapshot on its own cannot continue a server stream: without the
matching result channel, an incomplete resource starts a new browser attempt.

This can show useful content earlier, avoid duplicate loading, and let component
code arrive later. It does not make the underlying database call faster. Result
payloads, capture code, and subscriptions also have a cost; measure the complete
page. The [conversation streaming benchmark](../benchmarks/conversation-streaming/README.md)
documents what its arrival, input-preservation, and request-reuse checks cover.

### Connect signals in a custom SSR host

When you call the streaming renderer yourself, enable query-result delivery with
`streamedSignals`. These options go in the third argument when passing a
component and its props:

```ts
import { renderToReadableStream } from 'octane/server';
import { Chat } from './Chat.tsrx';

// Called by your host for each response. It supplies the deployed build ID.
export async function renderChat(request: Request, buildId: string) {
	const identity = { buildId, documentId: crypto.randomUUID() };
	const stream = await renderToReadableStream(Chat, undefined, {
		signal: request.signal,
		streamedSignals: identity,
	});
	return { stream, identity };
}
```

The host must put the same identity in its browser bootstrap metadata and
consume `stream` as it arrives. Do not wait for `allReady` before consuming a
Web stream: backpressure can prevent it from finishing. A `buildId` identifies
matching server and client output; `documentId` identifies this response.
They are not user IDs. Query-free renders do not emit the result receiver.

Before importing modules that read document signals, install
`bootstrapStreamedSignalHydration` from `octane/hydration/streamed-signals`,
then pass its `signalOwner` to later `hydrateRoot` calls. If the host owns HTML
placement and only needs result delivery, choose `bootstrapStreamedSignalResults`
instead. Install one bridge per document. The
[custom-host example](./signals.md#server-owned-html-without-a-client-renderer)
covers the initial signal manifest, control binding, and cleanup.

Start that browser bootstrap while the response is still arriving if the page
needs live signals before the response ends. The standard host arranges this;
a custom host must arrange its own early script loading.

An envelope-owning host can place `earlySignalBootstrapScript({ nonce })` before
any bound controls or result frames, then pass `earlySignalBootstrap: 'external'`
to its fragment renderers. The script records early input and results. Live
computations still require the signal engine. Dispose the browser bridge when
its document owner ends, and keep initial-response streams finite; ongoing live
updates need a separately managed connection.

### Leading list ranges on an owned SSR host

`getLeadingHydrationListRange(host)` from `octane/hydration` returns the first
list's existing `start` and `end` comments, plus `emptyMarker` and `itemsMarker`
strings that preserve its binding receipt. It follows only consecutive leading
plain or counted wrapper ranges, without skipping content or searching later
lists or descendants. Incomplete, malformed or typed wrapper ownership boundaries
return `null`.

Use this only on the exact fully parsed host whose SSR range your application
already owns and has accepted. It discovers a boundary, not an ownership lease
or a general DOM insertion API. Preserve compiler-authored item receipts and
use the returned marker values when an owned recovery row changes an empty
list to items or is cleared before hydration. Hydrate with the corresponding
accepted rows so the renderer can adopt those same nodes.

### Run an SSG script directly

When a server or SSG entry runs outside Vite, preload Octane's compiler before
the entry point:

**Node**

```sh
node --import octane/compiler/register entry-server.ts
```

**Bun**

```sh
bun --preload octane/compiler/register entry-server.ts
```

The preload is a server-only compiler pipeline. It compiles imported `.tsrx`
and `.tsx` components, assigns hook slots in imported plain `.ts`/`.js` custom
hooks, and resolves extensionless local imports such as `./App` under Node. Node
uses synchronous `node:module.registerHooks`; Bun uses an equivalent native
runtime plugin. Node 22.22.2 or newer is required, and Bun 1.3.14 is covered by
the integration suite.

Every bare `octane` runtime import in the loaded server graph targets
`octane/server`, including authored source dependencies that keep their manual
hook slots and otherwise pass through unchanged.

Do not use this preload for a browser entry: Vite, Rsbuild, or another Octane
build integration must produce the client compilation and bundle instead.

## API

The three buffered renderers return `RenderResult` with `html` and `css`, plus
optional `head` and `signals` fields:

- `html` — the rendered markup, including hydration markers and, when anything
  resolved, an inline `<script type="application/json" data-octane-suspense>`
  seed that hydration consumes. Hoisted `<title>`/`<meta>`/`<link>` (rendered
  anywhere in the tree, each preceded by an adoption marker comment) are folded
  in by default — spliced into `<head>` when the render produced a document or a
  fragment beginning with an authored `<head>`, else prepended (React-19 resource
  hoisting). `headChannel: 'separate'` withholds
  them and returns them as `head` instead.
- `head` — the hoisted metadata on its own, present **only** under
  `headChannel: 'separate'` (see `RenderOptions`).
- `signals` — a native signal manifest, when present, containing the ready
  values represented by this result's HTML. It is a snapshot, not an ongoing
  result stream.
- `css` — deduped `<style data-octane="hash">` tags, one per style scope the
  request rendered: a component contributes one tag per children list that
  holds a `<style>` block (its output fragment, nested elements, the fragments
  of nested `@{ … }` blocks and control-flow branches, assigned templates), and
  an assigned theme block contributes its own. Only components
  the render actually executed inject, in lexical pre-order. Place inside
  `<head>`. The client skips re-injecting any hash already present. (Kept as its
  own field because Octane has scoped CSS that React core does not.)

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
`$OCTRC` swap script when its data settles. A shell whose root renders
`<html>` leads the response with `<!DOCTYPE html>` (React Fizz parity —
streaming only; the buffered renderers stay doctype-free, also matching
React). Scoped styles flush with the shell
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

Synchronous iterable children, including generators, are materialized once and
use the same keyed hydration ranges as arrays. A thenable that settles while it
is first subscribed is unwrapped in that render without publishing a fallback.

`StreamOptions` extends `RenderOptions` with `onShellReady()`,
`onShellError(err)`, `onAllReady()`, `onHeadReady(head)`,
`onEarlyHydrationReady()`, and `injection`.
`onEarlyHydrationReady` tells a host that the shell uses signals that need
browser activation before the response finishes. It runs before the shell is
sent, after its query identities are prepared; feature-free renders do not call it.
`onHeadReady` fires only under `headChannel: 'separate'`, once, **before** the
shell is written and therefore before `onShellReady` and before
`renderToReadableStream`'s promise resolves, so a host still has time to place
the metadata in a template prefix it writes ahead of the render stream. It
carries the shell's metadata only; head elements hoisted inside a boundary that
streams later are still re-created client-side, while late-discovered Float
sheet resources ride the stream itself (see "Not built yet"). A recoverable error in
Suspense content reaches `onError`, preserves the emitted fallback, and marks
only that boundary for client rendering. Calling `abort(reason)` reports the
reason for each abandoned pending task, preserves emitted fallbacks for client
recovery, closes the destination, and invokes `onAllReady` once as the terminal
readiness notification; an unpublished shell still fails only once through
`onShellError`.

#### `injection?: StreamInjectionSource` (Octane extension)

Merge a live stream of externally-produced HTML — typically framework data
`<script>` tags materializing as loaders settle (e.g. TanStack Start's data
stream) — into the response natively, instead of re-parsing the emitted HTML
for safe insertion points. The source is
`{ take(): string; subscribe(notify) => unsubscribe; done: Promise<void>; renderComplete?() }`:
the renderer `take()`s queued HTML and emits it verbatim, in push order, each
drain as its own transport chunk strictly **between** renderer chunks (every
such boundary is tag-complete by construction) — never before the shell.
`renderComplete()` fires exactly once when the renderer has finished producing
markup — after the last boundary segment on success, or on the abort/error
path before degraded terminal output — so a source can finalize asynchronous
serialization and then settle `done`.

When the shell is a document (`… </body></html>`), **document mode** engages:
renderer-owned leading scoped styles (one tag per style scope, deduped by
hash) and the hoisted-head buffer fold inside the authored `<head>` instead of
preceding `<html>`, and the closing tail is
split out and written **last** — injected chunks and streamed Suspense
segments land inside `<body>`, and the stream (tail included) closes only
once rendering is complete **and** `done` has settled, so late data scripts
are never dropped. (The `<!DOCTYPE html>` preamble is not injection-gated:
every streamed document render leads with it, see above.) `subscribe`
notifications drain promptly even while the render is idle awaiting `done`;
bound the wait with `signal` (a source that never settles `done` holds the
response open). A `done` rejection fails the stream through the same degraded
terminal path as `abort`. Without `injection`, streamed output is unchanged
apart from that doctype preamble (measured flat on the streaming-ssr
benchmark).

A streamed fragment that begins with an authored `<head>` receives hoisted
metadata and renderer-owned leading scoped styles inside that head. It has no
core-owned doctype and does not enter injection's document-tail mode.

### `renderToReadableStream(component, props?, options?)` — `octane/server`

The same streaming engine over web streams: resolves with a
`ReadableStream<Uint8Array>` once the shell is ready (rejects on a shell error).
Output is pull-driven and bounded by consumer backpressure; cancelling the
reader cancels the render. The stream's `allReady` promise settles when every
boundary chunk has been accepted by the consumer, so consume the stream
concurrently rather than awaiting `allReady` before reading. Same
`StreamOptions`.

### `RenderOptions`

- `streamedSignals?: { buildId, documentId, selectionGeneration?, maxFrameBytes?, maxTotalBytes?, timeoutMs? }`
  — deliver observed query attempts to the browser's streamed-result receiver.
  Use matching build/document identities in the browser bootstrap. The optional
  limits default to 4 MiB per serialized frame, 64 MiB per response, and 30 seconds
  waiting for producer progress. The timeout pauses while data is queued or waiting
  for the transport sink to accept it, and restarts for the next producer read.
  It is separate from the render's Suspense deadline and does not limit total
  response duration. Request cancellation, the inactivity timeout, and a
  cancelled reader release producers immediately, including one parked on an
  idle async iterator: the iterator's `return()` runs without waiting for its
  pending `next()`. An `async function*` upstream queues that `return()` behind
  its own pending `await`, so an idle source it wraps should also observe the
  request's abort signal.
  The automatic multiplexer permits 256 live channels, including an external
  injection source; completed, drained channels release their slot. An attempt
  observed while every slot is live is not streamed or announced, so the browser
  loads it itself; the other channels are unaffected. Repeated observation of
  the same attempt does not replay its result.
  Browser result receivers renew their inactivity timeout on accepted result
  frames; an idle channel still expires even while siblings make progress.
  Unlike the server's timeout, the browser's cannot see transport backpressure:
  it measures wall time between accepted frames, including the time a frame
  spends in transit. Give the browser bootstrap a `timeoutMs` that covers the
  server's plus the slowest expected transfer of one `maxFrameBytes` frame.
  NDJSON transports time each pending producer or network read, while browser
  queue/placement waits retain their own timeout. Byte limits and the pre-module
  mailbox's 256 selections / 512 result frames still apply: long streams need an
  installed, consuming receiver. See [custom SSR hosts](#connect-signals-in-a-custom-ssr-host).
- `initialDocumentSignals?: ScopeSeed` — share a host-emitted immutable initial
  document seed with matching root, deferred and streamed historical reads. Pass
  the same original seed to `hydrateRoot` (and independent-boundary bootstrap).
  Distinct entries remain in each boundary's manifest; this option never
  initializes live client state. See [initial document history](./signals.md#share-the-initial-document-history).
- `signalOwner?: SignalOwner` — share a request-local signal owner across sibling
  SSR regions. A supplied owner is borrowed: the host retires it when its work
  ends. Do not share mutable owners across requests.
- `earlySignalBootstrap?: 'external'` — omit the renderer's early capture script
  because the host has already emitted `earlySignalBootstrapScript()` before
  bound controls and streamed results.
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
- `headChannel?: 'fold' | 'separate'` — where hoisted `<title>`/`<meta>`/`<link>`
  go. `'fold'` (default) keeps React's resource-hoisting shape described above.
  `'separate'` withholds the metadata from `html`/the streamed shell and hands it
  over on its own: `RenderResult.head` for the buffered renderers,
  `StreamOptions.onHeadReady` for the streaming ones. A host that renders into a
  `<head>`-bearing template it owns, rather than rendering the document itself,
  needs `'separate'`: a body-only render has no `</head>` for the fold to target,
  so folding prepends the metadata into the body, where a `<title>` loses to the
  template's and a canonical or description is ignored. For a body-only render,
  `head + html` under `'separate'` is byte-identical to `html` under `'fold'`;
  folding into an authored `<head>` instead inserts the metadata inside it.

A fragment beginning with an authored `<head>` is suitable for server-only
composition when the host supplies `<html>`. It cannot be hydrated with
`hydrateRoot(document, FragmentPage)` because a Document root expects the
rendered `<html>` element. To hydrate a host-owned document, render a body-only
app with `headChannel: 'separate'`, place its metadata in the host's `<head>`,
and hydrate the app container inside `<body>`. To hydrate an entire Document,
render an `<html>` root.

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

Server-function requests accept only JSON `POST` bodies, require the browser's
origin to match the application, and default to a one-mebibyte encoded body
limit. Global Octane middleware runs before each action, so authentication and
authorization policies apply to server functions as well as ordinary routes.
Invalid requests never invoke the action, and internal exception messages are
not exposed in HTTP responses.

Configure larger bodies or explicitly trusted additional origins in
`octane.config.ts`:

```ts
import { defineConfig } from '@octanejs/vite-plugin';

export default defineConfig({
	server: {
		rpc: {
			maxBodyBytes: 2 * 1024 * 1024,
			allowedOrigins: ['https://admin.example.com'],
		},
	},
});
```

Origins must be complete HTTP or HTTPS origins, never wildcard, path, or
credential-bearing values. Explicitly allowed origins receive the browser's
required `POST` preflight and exact-origin CORS response headers; preflight
requests never execute authorization middleware or server actions. Forwarded
origin headers are used only when
`server.trustProxy` is explicitly enabled behind a trusted proxy. The same
policy applies to Vite, Rsbuild, and generated Node or Web Worker servers.

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
  Compiler-owned request factories consult their matching server-provided seed
  before running, while existing promises, contexts, and externally owned
  hydration promises retain their original ownership.
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
around `<!--ssr-body-->` (`<!--ssr-head-->` receives the hydration data script
and the shell's hoisted `<title>`/`<meta>`/`<link>`; styles ride the stream), and
injects the hydration entry. The route renders into the template's
`<div id="root">` rather than as a document, so both dev and production request
`headChannel: 'separate'` and splice the metadata at `<!--ssr-head-->`: authored
metadata therefore lands in the real `<head>`, and hydration adopts those
elements from `document.head` instead of appending duplicates. Core's default
fold would instead prepend them inside `#root`. Note that core does not dedupe:
a `<title>` in the template and one in a component both ship, and the template's
wins by document order, so let the component own it. Route components
receive `{ params, url }`, and `router.preHydrate` names a client module whose
default export is awaited before `hydrateRoot` (e.g. an app router committing
its match tree). `module server` functions are executed through
`executeServerFunction`. For a custom server (see `examples/hacker-news`), write
your own `entry-server.ts` around `prerender()` or the streaming renderers and
serialize any app data (for example a dehydrated query-client cache) into your
own inline script.

Development SSR validates native HTML element nesting while it renders,
including relationships that cross component boundaries. When the browser
would repair a placement before hydration (for example, a `<div>` inside a
`<p>`), Octane reports both authored locations in the server console. The check
targets parser repairs rather than the complete HTML content model, never adds
diagnostics to returned markup, and is removed from production compilation.

On the server, page and layout props also receive `state`, the same
request-scoped `Context.state` Map middleware populated. It is deliberately not
serialized; browser hydration receives only `{ params, url }`.

In production, `vite build` emits both bundles: hashed client assets in
`dist/client` and a self-contained SSR server at `dist/server/entry.js`
(exports `handler`/`nodeHandler`, auto-boots under `node`; preview with
`octane-preview`). The production handler streams through the same engine and
emits the same hydratable shape as dev — `server.render: 'buffered'` switches
it to the await-everything `prerender`. A deploy adapter prepares the output for
its host. `adapter: vercel()` from `@octanejs/adapter-vercel` emits Vercel's
Build Output API under `.vercel/output`. `adapter: cloudflare()` from
`@octanejs/adapter-cloudflare` switches the server bundle to a Worker target and
emits `dist/server/worker.js`; point a user-owned `wrangler.jsonc` at that entry
and configure Workers Static Assets with `directory: "./dist/client"`. Keep
Cloudflare's asset-first default, leave `assets.not_found_handling` unset or
`"none"` (both `"single-page-application"` and `"404-page"` can bypass SSR),
and enable `nodejs_compat`. The Worker passes `{ env, ctx }` through
`Context.platform` for bindings and `waitUntil`. Request abort signals reach both render modes;
the built-in Node bridge also waits for `drain` and cancels the render when the
response socket closes. Its HTTP transport negotiates streaming gzip for
eligible SSR and static text responses while preserving HEAD, partial,
pre-encoded, `no-transform`, and non-compressible responses.

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
no props. When both are configured, the catch boundary is closest to the route
and the pending boundary wraps it, so route errors reach the catch UI while
suspensions still select the pending UI. Paths must be Vite-root paths. `index.html` must contain exactly one
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

- **Islands-only route hydration and shell removal**: deferred and independent
  [`<Hydrate>` boundaries](./deferred-hydration.md) are implemented, but the
  generated app entry still loads the route and hydrates the composed root.
  Automatic shell removal and renderer-free island selection remain
  [proposed](./hydration-islands-plan.md).
- **Streamed head hoisting**: head elements and resource hints hoisted from
  INSIDE a streamed Suspense boundary don't ship in the stream (the shell
  already flushed); the client re-creates them on hydration. Float **sheet
  resources** (`<link rel="stylesheet" href precedence>` and
  `<style href precedence>`) are the exception: sheets discovered after the
  shell ride the wave chunks as real tags and the inline stream runtime hoists
  them into `document.head` with the client's precedence grouping, so late
  content is styled before hydration and no-JS consumers still get the CSS.
- **General application-data serialization**: Suspense/signal seeds and supported
  independent-island captures cross through their defined protocols. Arbitrary
  route/request state is not automatically serialized.
- **Error digests**: `onError` and the shell callbacks exist, but there are no
  React-style error digests. Recoverable Suspense errors retain their fallback
  and mark that boundary for client rendering; a fatal post-shell error ends the
  stream with every still-pending boundary marked for client rendering.
- **Document orchestration beyond the streaming doctype**: a streamed `<html>`
  root gets the core-owned doctype described above, but core does not own
  arbitrary preamble insertion, bootstrap script/module lists, import-map
  construction, response headers, or `onHeaders`. Compose those concerns around
  the returned stream in the Vite plugin, adapter, or application server.
- ~~`prerenderToNodeStream`~~ — implemented: it resolves after the
  await-everything render completes and `prelude` streams the complete document
  bytes (scoped-style tags, then folded html). The buffered `prerender` keeps
  its `{ html, css }` shape.
- **Partial pre-rendering** (`resume`, `resumeToPipeableStream`,
  `resumeAndPrerender`, and React's postpone/prelude protocol): a documented
  non-goal — that request protocol is not part of Octane's public SSR surface.
- **Chunk-size and namespace options**: `progressiveChunkSize` does not exist
  (Octane flushes per resolution wave, not by byte thresholds) and
  `namespaceURI` is inferred from the rendered root rather than accepted as an
  option.
