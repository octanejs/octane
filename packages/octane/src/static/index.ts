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
 * `prerenderToNodeStream` mirrors React's shape: it resolves only after the
 * await-everything render completes, and `prelude` streams the COMPLETE
 * document bytes (scoped-style tags, then the folded html). React 19.2's
 * partial pre-rendering — `resume`, `resumeAndPrerender`, and the
 * postpone/prelude-with-holes protocol — is a documented non-goal: that
 * request protocol is not part of Octane's public SSR surface, so there is no
 * `postponed` field and the buffered `prerender` resolves `{ html, css }`
 * rather than React's `{ prelude: ReadableStream }`.
 */
export { version } from '../version.js';

export {
	prerender,
	prerenderToNodeStream,
	type RenderResult,
	type RenderOptions,
	type ServerRenderNode,
} from '../runtime.server.js';
