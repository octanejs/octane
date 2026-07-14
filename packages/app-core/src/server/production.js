// @ts-check
/**
 * Production fetch-handler factory + config re-exports.
 *
 * `createHandler(manifest, deps)` is the runtime entry the generated server
 * bundle (dist/server/entry.js) calls in production. It is designed to be
 * BUNDLED: platform-agnostic (no Node imports — platform capabilities come via
 * `manifest.runtime`), and free of vite / octane-compiler imports (which is why
 * `resolveOctaneConfig` is re-exported from resolve-config.js, not
 * load-config.js).
 *
 * The render path mirrors the DEV middleware's `handleRenderRoute`
 * (server/render-route.js) byte-for-byte in everything hydration can see —
 * the same `renderToReadableStream` engine, the same `#__octane_data` payload
 * (same keys, same order), and the same template-prefix → render-stream →
 * template-suffix assembly — so `hydrateRoot()` adopts a production response
 * exactly as it adopts a dev one. Deliberate differences: the template is the
 * BUILT dist/client/index.html (hashed hydrate script already in place, so
 * nothing is injected per-request), per-route `<link rel=stylesheet/modulepreload>`
 * tags from the client manifest join the head, and render errors produce a
 * plain 500 (no dev stack page). Keep the two files in sync when the shape
 * changes.
 */

import { createRouter } from './router.js';
import { createContext, runMiddlewareChain } from './middleware.js';
import { handleServerRoute } from './server-route.js';
import { composeHtmlStream } from './html-stream.js';
import {
	applyHydrationNonce,
	getContextNonce,
	nonceAttribute,
	splitSsrTemplate,
	validateSsrTemplate,
} from './html-template.js';
import {
	createLayoutWrapper,
	createPropsWrapper,
	createRootBoundaryWrapper,
} from './component-wrappers.js';
export {
	createLayoutWrapper,
	createPropsWrapper,
	createRootBoundaryWrapper,
} from './component-wrappers.js';
import {
	get_component_export,
	get_route_entry_export_name,
	get_route_entry_path,
} from '../routes.js';
import {
	patch_global_fetch,
	build_rpc_lookup,
	is_rpc_request,
	handle_rpc_request,
} from '@ripple-ts/adapter/rpc';

export { resolveOctaneConfig } from '../resolve-config.js';

// A server integration can reload its compiled manifest repeatedly while the
// process (and global fetch) stays alive. Ripple's fetch patch is deliberately
// idempotent, so calling it again cannot replace its closed-over handler or
// async context. Keep one process-wide dispatcher instead: every new
// createHandler() updates the target while reusing the context captured by the
// first patch. Symbol.for makes this survive app-core being bundled/evaluated
// again by a dev server.
const FETCH_COORDINATOR_KEY = Symbol.for('octane.app-core.fetch-coordinator');

/**
 * @typedef {Object} FetchCoordinator
 * @property {import('@ripple-ts/adapter/rpc').AsyncContext} asyncContext
 * @property {((request: Request) => Promise<Response>) | null} handler
 */

/**
 * @param {import('@ripple-ts/adapter').RuntimePrimitives | undefined} runtime
 * @returns {FetchCoordinator | null}
 */
function getFetchCoordinator(runtime) {
	if (!runtime) return null;
	const globals =
		/** @type {typeof globalThis & { [FETCH_COORDINATOR_KEY]?: FetchCoordinator }} */ (globalThis);
	let coordinator = globals[FETCH_COORDINATOR_KEY];
	if (coordinator) return coordinator;

	const asyncContext = runtime.createAsyncContext();
	coordinator = { asyncContext, handler: null };
	// Publish before installing the dispatcher so another evaluated app-core
	// copy observes the same mutable coordinator.
	globals[FETCH_COORDINATOR_KEY] = coordinator;
	const fetchHandle = patch_global_fetch(asyncContext);
	const shared = coordinator;
	fetchHandle.set_handler((request) => {
		if (!shared.handler) {
			return Promise.resolve(new Response('Octane handler is not ready', { status: 503 }));
		}
		return shared.handler(request);
	});
	return coordinator;
}

/**
 * @typedef {import('@octanejs/app-core').RenderRoute} RenderRoute
 * @typedef {import('@octanejs/app-core').Middleware} Middleware
 * @typedef {import('@octanejs/app-core').Context} Context
 */
/**
@import { ServerManifest, HandlerOptions, ClientAssetEntry } from '../../types/production.d.ts'
 */

/**
 * Create the production request handler from a manifest.
 *
 * The returned function is a standard Web `fetch`-style handler:
 * `(request: Request) => Promise<Response>` — the generated server entry boots
 * it behind the adapter's `serve()` (or the built-in Node server), and
 * serverless wrappers import it directly.
 *
 * @param {ServerManifest} manifest
 * @param {HandlerOptions} deps
 * @returns {(request: Request) => Promise<Response>}
 */
export function createHandler(manifest, deps) {
	const { renderToReadableStream, prerender, htmlTemplate, executeServerFunction } = deps;
	const router = createRouter(manifest.routes);
	const globalMiddlewares = manifest.middlewares ?? [];
	const trustProxy = manifest.trustProxy ?? false;
	const runtime = manifest.runtime;
	validateSsrTemplate(htmlTemplate);
	// Also pin the built-template contract up front. The marker is emitted by
	// the integration's HTML transform and survives source hashing.
	applyHydrationNonce(htmlTemplate, null);

	// RPC lookup for statically imported `module server` functions
	// (compiler hash → server function).
	const rpcLookup =
		manifest.rpcModules && runtime ? build_rpc_lookup(manifest.rpcModules, runtime.hash) : null;

	// Request-scoped async context + same-origin fetch short-circuit: fetch()
	// during SSR that resolves to this origin routes through the handler
	// in-process instead of a network round-trip.
	const fetchCoordinator = getFetchCoordinator(runtime);
	const asyncContext = fetchCoordinator?.asyncContext;

	const handler = async function handler(/** @type {Request} */ request) {
		const url = new URL(request.url);
		const method = request.method;

		if (is_rpc_request(url.pathname)) {
			if (!rpcLookup || !asyncContext) {
				return new Response(JSON.stringify({ error: 'RPC is not configured' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return handle_rpc_request(request, {
				resolveFunction(/** @type {string} */ hash) {
					const entry = rpcLookup.get(hash);
					if (!entry) return null;
					const fn = entry.serverObj[entry.funcName];
					return typeof fn === 'function' ? fn : null;
				},
				executeServerFunction,
				asyncContext,
				trustProxy,
			});
		}

		const match = router.match(method, url.pathname);
		if (!match) {
			// Static assets never reach here (the static layer — the built-in Node
			// server, or the platform's file serving — runs first); an app with a
			// catch-all RenderRoute matches everything else, so this is only hit
			// when no catch-all exists.
			return new Response('Not Found', { status: 404 });
		}

		const context = createContext(request, match.params);

		try {
			if (match.route.type === 'render') {
				return await runMiddlewareChain(
					context,
					globalMiddlewares,
					match.route.before || [],
					async () => renderRoute(/** @type {RenderRoute} */ (match.route), context),
					[],
				);
			}
			return await handleServerRoute(match.route, context, globalMiddlewares);
		} catch (error) {
			console.error('[octane] Request error:', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	};

	if (fetchCoordinator) fetchCoordinator.handler = handler;

	/**
	 * Render a RenderRoute — the production twin of dev's `handleRenderRoute`.
	 *
	 * @param {RenderRoute} route
	 * @param {Context} context
	 * @returns {Promise<Response>}
	 */
	async function renderRoute(route, context) {
		const entryPath = get_route_entry_path(route.entry);
		const exportName = get_route_entry_export_name(route.entry);
		const PageComponent = entryPath
			? get_component_export(manifest.components[entryPath] ?? {}, exportName)
			: null;
		if (!PageComponent) {
			throw new Error(`Component not found for route ${route.path}`);
		}

		// Identical props to dev: `{ params, url }`, url origin-free so the client
		// re-renders the exact string.
		const requestUrl = context.url.pathname + context.url.search;
		const pageProps = { params: context.params, url: requestUrl, state: context.state };
		const nonce = getContextNonce(context);

		let RootComponent;
		if (route.layout) {
			const LayoutComponent = get_component_export(manifest.layouts[route.layout] ?? {}, undefined);
			if (!LayoutComponent) {
				throw new Error(`No layout component found for ${route.layout}`);
			}
			RootComponent = createLayoutWrapper(
				/** @type {any} */ (LayoutComponent),
				/** @type {any} */ (PageComponent),
				pageProps,
			);
		} else {
			RootComponent = createPropsWrapper(/** @type {any} */ (PageComponent), pageProps);
		}
		RootComponent = createRootBoundaryWrapper(
			RootComponent,
			{
				pending: manifest.rootBoundary?.pending ?? null,
				catch: manifest.rootBoundary?.catch ?? null,
			},
			deps,
		);

		// The hydration payload — SAME keys, SAME order as dev render-route.js, so
		// the data script is byte-identical between dev and production.
		const routeData = JSON.stringify({
			entry: entryPath,
			exportName: exportName ?? null,
			layout: route.layout ?? null,
			routeIndex: getRenderRouteIndex(manifest.routes, route),
			params: context.params,
			url: requestUrl,
			preHydrate: manifest.preHydrate ?? null,
			rootBoundary: manifest.rootBoundaryEntries ?? { pending: null, catch: null },
		});
		const dataScript = `<script id="__octane_data" type="application/json"${nonceAttribute(nonce)}>${escapeScript(routeData)}</script>`;

		// Per-route asset hints from the client manifest: stylesheet links so
		// page CSS applies before hydration, modulepreload so the page chunk
		// downloads in parallel with the hydrate entry (which the template's own
		// script tag already references).
		/** @type {string[]} */
		const preloadTags = [];
		const entryAssets = entryPath ? manifest.clientAssets?.[entryPath] : undefined;
		if (entryAssets) {
			for (const cssFile of entryAssets.css) {
				preloadTags.push(`<link rel="stylesheet" href="/${cssFile}">`);
			}
			if (entryAssets.js) {
				preloadTags.push(`<link rel="modulepreload" href="/${entryAssets.js}">`);
			}
		}

		const headContent = [...preloadTags, dataScript].join('\n');
		const html = applyHydrationNonce(htmlTemplate, nonce).replace('<!--ssr-head-->', headContent);

		const status = route.status ?? 200;
		const headers = { 'Content-Type': 'text/html; charset=utf-8' };

		const [prefix, suffix] = splitSsrTemplate(html);

		if (manifest.render === 'buffered') {
			// Await-everything fallback (`prerender` from octane/static): no
			// streaming, one document. The deduped scoped-style tags lead the body
			// markup inside #root — the same position they hold in the streamed
			// shell — so hydrateRoot's leading-style skip applies unchanged.
			const { html: body, css } = await prerender(RootComponent, undefined, {
				nonce: nonce ?? undefined,
				signal: context.request.signal,
				onError(/** @type {unknown} */ error) {
					console.error('[octane] SSR render error:', error);
				},
			});
			return new Response(prefix + css + body + suffix, { status, headers });
		}

		// Streaming (default): shell flushes at first await, suspense segments
		// stream out-of-order behind it — identical to dev.
		/** @type {ReadableStream<Uint8Array>} */
		const renderStream = await renderToReadableStream(RootComponent, undefined, {
			nonce: nonce ?? undefined,
			signal: context.request.signal,
			onError(/** @type {unknown} */ error) {
				console.error('[octane] SSR render error:', error);
			},
		});

		const body = composeHtmlStream(prefix, renderStream, suffix);

		return new Response(body, { status, headers });
	}

	return handler;
}

/**
 * @param {import('@octanejs/app-core').Route[]} routes
 * @param {RenderRoute} route
 * @returns {number | undefined}
 */
function getRenderRouteIndex(routes, route) {
	const renderRoutes = routes.filter((r) => r.type === 'render');
	const index = renderRoutes.indexOf(route);
	return index === -1 ? undefined : index;
}

/**
 * Escape script content to prevent XSS in the inline JSON data block.
 * @param {string} str
 * @returns {string}
 */
function escapeScript(str) {
	return str.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
