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
 * `prerenderToNodeStream` is not implemented yet (tracked as planned work in the
 * React-parity ledger). React 19.2's partial pre-rendering — `resume`,
 * `resumeAndPrerender`, and the postpone/prelude protocol — is a documented
 * non-goal: that request protocol is not part of Octane's public SSR surface,
 * and `prerender` here resolves `{ html, css }` rather than React's
 * `{ prelude: ReadableStream }`.
 */
export { prerender, type RenderResult, type RenderOptions } from '../runtime.server.js';
