/**
 * `octane/static` — the static-generation SSR entry, mirroring React's
 * `react-dom/static`.
 *
 * `prerender(Component, props?, options?)` runs the await-EVERYTHING render:
 * every `use(thenable)` resolves (Suspense boundaries render their success arm),
 * so the returned `{ html, css }` is fully-resolved with no client fallback —
 * for SSG or any place that wants complete HTML. Contrast `octane/server`'s
 * `renderToString` (single sync pass, fallbacks for suspended boundaries) and
 * the streaming APIs.
 *
 * The stream variants (`prerenderToNodeStream`) land with the streaming engine.
 */
export { prerender, type RenderResult, type RenderOptions } from '../runtime.server.js';
