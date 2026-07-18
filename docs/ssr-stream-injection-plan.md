# SSR stream injection — native external-HTML merging for streamed renders

Status: ALL PHASES IMPLEMENTED (2026-07-19) — `StreamOptions.injection`
(`StreamInjectionSource`, incl. the `renderComplete()` completion hook) landed
in `runtime.server.ts` (#169), followed by DOCUMENT MODE (auto
`<!DOCTYPE html>`, leading styles + hoisted head folded into `<head>`, held
tail) and the switch of `@octanejs/tanstack-start`'s vendored
`renderRouterToStream` onto the native API — deleting its
`transformStreamWithRouter` / `relocateLeadingOctaneStylesToHead` /
`prependDoctype` usage and restoring out-of-order streaming for document
renders (the upstream transform buffered every post-shell chunk into its
64 KiB-capped tail until both streams ended). Contract tests in
`packages/octane/tests/streaming-ssr-injection.test.ts` (both compile modes),
website ssr-hydration e2e green on the native path (cold cache, dev +
production preview), streaming-ssr benchmark flat for the no-injection path;
user docs in `docs/ssr.md`. Open questions resolved: the tail is held (and
document mode engages) ONLY when `injection` is present; `onAllReady`/close
both gate on `done`; the script-barrier lift maps to octane's post-shell
subscribe. Remaining follow-up: auto-doctype for document renders WITHOUT
injection is a candidate React-parity change, measured separately; upstream
the native-path `renderRouterToStream` to TanStack.
Requested by: TanStack team feedback via the `@tanstack/octane-start` integration
(2026-07-18).

## The ask

TanStack Start merges two HTML sources into one response stream: the render
framework's SSR stream, and the router's data stream (`<script>` tags carrying
serialized loader data, streamed-promise resolutions, and hydration metadata
that materialize over time as loaders settle). Today that merge happens
OUTSIDE the framework, by decoding the framework's byte stream and re-parsing
it as text to find safe insertion points. The ask: let a framework hand octane
a live source of `<script>` HTML and have octane merge it natively — octane
already knows its own tag boundaries, so the text re-parsing is pure overhead.

## What the external merge does today (upstream TanStack)

`@tanstack/router-core/ssr/server` `transformStreamWithRouter`
(dist/esm/ssr/transformStreamWithRouter.js) pipes octane's stream through a
transform that:

1. Decodes bytes → text (`TextDecoder`, re-encoding on write).
2. Scans every chunk BACKWARDS for the last complete closing tag
   (`findHtmlBoundary`) so injected scripts never land mid-tag, keeping a
   `leftover` buffer (capped 2 KiB) for partial tags split across chunks.
3. Detects `</body>` and holds everything from it onward as a `pendingTail`
   (capped 64 KiB) so injected scripts always land inside `<body>` — octane's
   shell chunk contains the FULL document including `</body></html>`, and
   octane's own suspense segments stream after `</html>`, so the transform
   effectively restructures octane's output around the tail.
4. Flushes router HTML queued by `serverSsr.onInjectedHtml` at each safe
   boundary (event-driven, capped 16 MiB), plus a `$tsr-stream-barrier`
   marker protocol that holds scripts until a marker rendered by the app has
   flushed.
5. Closes only when BOTH the app stream is done AND router serialization is
   finished (`onSerializationFinished`), then emits leftover + pending scripts
   + the held tail. Serialization/lifetime timeouts guard the wait.

On top of that, `@tanstack/octane-router/ssr/renderRouterToStream.ts` runs two
MORE text-level transforms working around missing octane hooks:

- `relocateLeadingOctaneStylesToHead` — octane emits renderer-owned scoped
  `<style data-octane>` blocks BEFORE the markup; for a full document that
  puts them before `<html>`, so the transform holds them and re-inserts after
  the opening `<head>` (bounded 64 KiB document-prefix buffer).
- `prependDoctype` — octane never emits `<!DOCTYPE html>`.

## Why octane can do this natively, cheaply

Octane's streaming engine (`runtime.server.ts`, `runStream`, ~line 5913) is
pass-based and writes discrete chunks through a single `StreamSink`:

- the shell chunk (leading styles + head + body + seeds + swap runtime),
- one chunk per resolution wave (new styles + completed boundary segments),
- terminal degraded-boundary markers.

Every `sink.write` boundary is tag-complete BY CONSTRUCTION — octane
concatenates whole elements; a chunk can never end mid-tag. So "find a safe
insertion point" is free: every point between two sink writes is safe. The
three pieces of information the external transform reconstructs by parsing —
tag boundaries, the `</body>` position, and end-of-render — are all first-class
facts inside `runStream`.

## Proposed API (octane extension tier, not React parity)

React has no equivalent (Fizz owns its data injection internally), so this is
an octane-only extension on the existing `StreamOptions`, exported under
`octane/server`:

```ts
export interface StreamInjectionSource {
	/**
	 * Pull queued HTML (concatenated, verbatim). Called by the renderer at
	 * every emission boundary; return '' when nothing is queued.
	 */
	take(): string;
	/**
	 * The source notifies when new HTML is queued. The renderer then flushes
	 * promptly as its own chunk — even when no render output is pending.
	 * Returns an unsubscribe function; the renderer unsubscribes on
	 * completion, abort, and error.
	 */
	subscribe(notify: () => void): () => void;
	/**
	 * The renderer holds the document tail (`</body></html>` for document
	 * renders) and the stream close until this settles. A rejection aborts
	 * the stream through the existing fatal path.
	 */
	done: Promise<void>;
}

interface StreamOptions {
	// ...existing: signal, nonce, onError, onShellReady, onAllReady, ...
	injection?: StreamInjectionSource;
}
```

Renderer contract:

1. **Placement** — injected HTML is emitted verbatim, in push order, as its own
   chunks strictly BETWEEN renderer chunks, and (for document renders) before
   the held `</body></html>` tail. Never interleaved inside a renderer chunk.
2. **Tail holding** — when the shell renders a document (`<html>`/`<body>`
   detected at generation time, not by re-parsing), the closing
   `</body></html>` is split out of the shell chunk and written last: after
   the final wave AND after `injection.done` settles. Suspense segments —
   which today stream after `</html>` — consequently move INSIDE body, which
   is also strictly more correct HTML. Fragment renders have no tail; injected
   chunks simply append between renderer chunks, and `done` still gates close.
3. **Liveness** — a `subscribe` notification triggers a flush through the same
   serialized write path as render output (total order, backpressure through
   the existing sink pressure gate). When the render finishes first, the
   stream stays open draining injections until `done`; `signal` abort and the
   existing timeout guards still bound the wait, and the terminal path drains
   a final `take()` before the tail so late scripts aren't dropped.
4. **Errors** — `done` rejection or a `take()`/`subscribe` throw routes through
   the existing fatal path (degraded-boundary markers + `sink.fatal`), after
   unsubscribing.

### Adjacent gaps to close in the same change (both currently worked around by
### text transforms in octane-router)

- **Styles-in-head**: when the shell pass renders a document with a `<head>`,
  emit renderer-owned `<style data-octane>` blocks inside it instead of before
  `<html>` (this is where the styles belong; the pre-markup position only
  serves fragment roots, which keep the current behavior).
- **Doctype**: emit `<!DOCTYPE html>` automatically when the root element is
  `<html>` (React Fizz parity).

With those, `@tanstack/octane-start`'s stream path reduces to: render with
`injection` wired to `serverSsr` (push on `onInjectedHtml`, resolve `done` on
`onSerializationFinished`, keep their barrier/timeout policy upstream of the
source), and the entire `transformStreamWithRouter` +
`relocateLeadingOctaneStylesToHead` + `prependDoctype` pipeline disappears for
octane. The bot/buffered path (`prerender` + `finalizeBufferedHtml` splicing)
is out of scope here but could later accept a buffered variant (a single
`take()` at finalize before the tail).

## Implementation sketch

All inside `packages/octane/src/runtime.server.ts`:

- `runStream` gains an injection drain: a `drainInjection()` that `take()`s and
  writes through a small promise-chained writer shared with the wave loop
  (total write order; the loop currently awaits `sink.write` inline, so the
  chain is the one new mechanism — out-of-band notifies must not interleave
  with an in-flight wave write).
- Shell emission: for document renders, split the tail before writing
  (`pass.body` generation can carry the split point out of the emitter so no
  string scanning is needed; a one-time `lastIndexOf('</body>')` on the shell
  string is the fallback and is still O(shell) once, not O(stream)).
- Drain points: after the shell write, after each wave write, on notify, and
  terminally before the tail in both the success and fatal paths.
- Completion: `sink.allReady()`/close waits on `Promise.all`-style composition
  of the wave loop and `injection.done`, still guarded by `signal` and the
  existing MAX/timeout machinery.
- Both public sinks (`renderToPipeableStream`, `renderToReadableStream`)
  inherit the behavior unchanged — the feature lives entirely in `runStream`
  + shell assembly.

## Validation plan (core-engineering.md discipline)

- Contract tests in `packages/octane/tests/streaming-ssr` territory: ordering
  (injected between chunks, never inside), document tail held until `done`,
  fragment renders, notify-while-idle flushes, done-before-render /
  render-before-done, abort mid-injection, `done` rejection, backpressure
  (injection respects sink pressure), nonce untouched on injected content.
- A document-render streaming test (none exists today — current streaming
  tests are fragment-focused) pinning tail placement + segments-inside-body.
- Differential proof at the Start layer: drive the website through a
  `serverSsr`-backed injection source and byte-compare against the current
  `transformStreamWithRouter` output (modulo segment placement now being
  inside `<body>`, which hydration must and does tolerate — covered by the
  existing website e2e).
- Perf: `benchmarks/streaming-ssr` + `benchmarks/ssr-throughput` before/after
  for the no-injection path (must be flat — the feature must cost nothing when
  `injection` is absent), plus a website-route measurement for the injected
  path (expected win: removes decode→scan→re-encode of the full stream).

## Open questions

1. Should `injection` also gate `onAllReady` (React's semantics for "document
   fully ready") or only the close? Proposal: gate close only; `onAllReady`
   stays render-complete (documented).
2. Segment placement moving inside `<body>` changes streamed-HTML shape for
   ALL document renders (even without injection) if tail-holding is
   unconditional. Proposal: hold the tail only when `injection` is present, to
   keep the no-injection byte shape identical until measured separately.
3. Whether TanStack's barrier protocol wants a first-class hook ("notify me
   when the shell was accepted by the transport") — `onShellReady` already
   fires at that point, so probably no new API is needed.
