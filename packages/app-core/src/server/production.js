// @ts-check
/**
 * Production fetch-handler factory + config re-exports.
 *
 * `createHandler(manifest, deps)` is the runtime entry the generated server
 * bundle (dist/server/entry.js) calls in production. It is designed to be
 * BUNDLED: platform-agnostic (no Node imports — platform capabilities come via
 * `manifest.runtime`), and free of Vite / compiler-transform imports (which is
 * why `resolveOctaneConfig` is re-exported from resolve-config.js, not
 * config-loader.js). Its renderer config helper is dependency-free.
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
import { handleRpcRequest } from './rpc.js';
import { rpcIdCollision } from './rpc-registry.js';
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
import { patch_global_fetch, build_rpc_lookup, is_rpc_request } from '@ripple-ts/adapter/rpc';

export { resolveOctaneConfig } from '../resolve-config.js';

const HEAD_MARKER = '<!--ssr-head-->';
const BODY_MARKER = '<!--ssr-body-->';
const BODY_CLOSE_TAG = /<\/body\s*>/i;

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
 * @property {import('@ripple-ts/adapter/rpc').AsyncContext<{ origin?: string, platform?: unknown }>} asyncContext
 * @property {((request: Request, platform?: unknown) => Promise<Response>) | null} handler
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
		return shared.handler(request, shared.asyncContext.getStore()?.platform);
	});
	return coordinator;
}

/**
 * Name every server function id, built once per handler.
 *
 * `build_rpc_lookup` keeps only the namespace object and export name, but a
 * middleware policy needs the declaring module before the function is resolved.
 *
 * @param {Record<string, Record<string, Function>>} rpcModules
 * @param {(value: string) => string} hashFn
 * @returns {Map<string, { module: string, export: string }>}
 */
function buildRpcDescriptors(rpcModules, hashFn) {
	/** @type {Map<string, { module: string, export: string }>} */
	const descriptors = new Map();
	for (const [entryPath, serverObj] of Object.entries(rpcModules)) {
		for (const funcName of Object.keys(serverObj)) {
			const id = hashFn(entryPath + '#' + funcName);
			// Each manifest entry is listed once, so an id already taken here is a
			// genuine collision. `build_rpc_lookup` would resolve it by overwriting.
			const existing = descriptors.get(id);
			if (existing !== undefined) {
				throw rpcIdCollision(id, existing, { module: entryPath, export: funcName });
			}
			descriptors.set(id, { module: entryPath, export: funcName });
		}
	}
	return descriptors;
}

/**
 * Split the immutable, validated production template around both insertion
 * markers once. Dynamic head content is then concatenated into the prepared
 * fragments without rescanning the complete template on every request.
 *
 * `splitSsrTemplate` historically revalidated after head insertion. Preserve
 * that behavior on the exceptional path where inserted content could change
 * the body-marker contract.
 *
 * @param {string} html
 * @returns {(headContent: string) => string[]}
 */
function prepareSsrTemplate(html) {
	const [prefix, suffix] = splitSsrTemplate(html);
	const prefixHeadAt = prefix.indexOf(HEAD_MARKER);
	const headInPrefix = prefixHeadAt !== -1;
	const headAt = headInPrefix ? prefixHeadAt : suffix.indexOf(HEAD_MARKER);
	const headSide = headInPrefix ? prefix : suffix;
	const beforeHead = headSide.slice(0, headAt);
	const afterHead = headSide.slice(headAt + HEAD_MARKER.length);

	return (headContent) => {
		const nextPrefix = headInPrefix ? beforeHead + headContent + afterHead : prefix;
		const nextSuffix = headInPrefix ? suffix : beforeHead + headContent + afterHead;
		if (headContent.includes(BODY_MARKER) || BODY_CLOSE_TAG.test(headContent)) {
			return splitSsrTemplate(nextPrefix + BODY_MARKER + nextSuffix);
		}
		return [nextPrefix, nextSuffix];
	};
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
 * @typedef {Object} PreparedRenderRoute
 * @property {number} index
 * @property {string | undefined} assetHead
 */

/**
 * Index the production manifest once, matching the router's handler-lifetime
 * snapshot. Integrations create a new handler when replacing that manifest.
 * Asset tags are populated lazily on the first request for each route, avoiding
 * both repeated assembly on hot routes and eager work for routes an isolate may
 * never serve.
 *
 * @param {import('@octanejs/app-core').Route[]} routes
 * @returns {Map<RenderRoute, PreparedRenderRoute>}
 */
function prepareRenderRoutes(routes) {
	/** @type {Map<RenderRoute, PreparedRenderRoute>} */
	const prepared = new Map();
	let index = 0;
	for (const route of routes) {
		if (route.type !== 'render') continue;
		// Preserve Array#indexOf semantics if a caller reuses one route object.
		if (!prepared.has(route)) prepared.set(route, { index, assetHead: undefined });
		index++;
	}
	return prepared;
}

/**
 * @param {ServerManifest} manifest
 * @param {RenderRoute} route
 * @param {string | undefined} entryPath
 * @returns {string}
 */
function prepareRouteAssetHead(manifest, route, entryPath) {
	/** @type {string[]} */
	const tags = [];
	const clientAssets = manifest.clientAssets;
	if (clientAssets) {
		/** @type {Set<string>} */
		const stylesheets = new Set();
		for (const modulePath of [
			entryPath,
			route.layout,
			manifest.rootBoundary?.pending ? manifest.rootBoundaryEntries?.pending?.path : undefined,
			manifest.rootBoundary?.catch ? manifest.rootBoundaryEntries?.catch?.path : undefined,
		]) {
			if (!modulePath) continue;
			for (const cssFile of clientAssets[modulePath]?.css ?? []) {
				if (stylesheets.has(cssFile)) continue;
				stylesheets.add(cssFile);
				tags.push(`<link rel="stylesheet" href="/${cssFile}">`);
			}
		}
	}
	// Only the page chunk was already eager; do not promote layout, fallback,
	// or island JavaScript while making their server-rendered CSS available.
	const entryAssets = entryPath ? clientAssets?.[entryPath] : undefined;
	if (entryAssets?.js) {
		tags.push(`<link rel="modulepreload" href="/${entryAssets.js}">`);
	}
	return tags.join('\n');
}

/**
 * Create the production request handler from a manifest.
 *
 * The returned function is a standard Web `fetch`-style handler:
 * `(request: Request, platform?: unknown) => Promise<Response>` — the generated
 * server entry boots it behind the adapter's `serve()` (or the built-in Node
 * server), and serverless wrappers import it directly. Integrations can expose
 * request-scoped platform bindings to middleware and routes via the optional
 * second argument.
 *
 * @param {ServerManifest} manifest
 * @param {HandlerOptions} deps
 * @returns {(request: Request, platform?: unknown) => Promise<Response>}
 */
export function createHandler(manifest, deps) {
	const { renderToReadableStream, prerender, htmlTemplate, executeServerFunction } = deps;
	const router = createRouter(manifest.routes);
	const preparedRenderRoutes = prepareRenderRoutes(manifest.routes);
	const globalMiddlewares = manifest.middlewares ?? [];
	const trustProxy = manifest.trustProxy ?? false;
	const rpcPolicy = manifest.rpc;
	const runtime = manifest.runtime;
	validateSsrTemplate(htmlTemplate);
	// Also pin the built-template contract up front. The marker is emitted by
	// the integration's HTML transform and survives source hashing. Prepare the
	// normalized no-nonce template once: this is the common request path, and its
	// static fragments are identical for every request handled by this manifest.
	const splitHydrationTemplate = prepareSsrTemplate(applyHydrationNonce(htmlTemplate, null));

	// RPC lookup for statically imported `module server` functions
	// (compiler hash → server function).
	const rpcLookup =
		manifest.rpcModules && runtime ? build_rpc_lookup(manifest.rpcModules, runtime.hash) : null;
	const rpcDescriptors =
		manifest.rpcModules && runtime ? buildRpcDescriptors(manifest.rpcModules, runtime.hash) : null;

	// Request-scoped async context + same-origin fetch short-circuit: fetch()
	// during SSR that resolves to this origin routes through the handler
	// in-process instead of a network round-trip.
	const fetchCoordinator = getFetchCoordinator(runtime);
	const asyncContext = fetchCoordinator?.asyncContext;

	const handler = async function handler(
		/** @type {Request} */ request,
		/** @type {unknown} */ platform = undefined,
	) {
		const url = new URL(request.url);
		const method = request.method;

		if (is_rpc_request(url.pathname)) {
			if (!rpcLookup || !asyncContext) {
				return new Response(JSON.stringify({ error: 'RPC is not configured' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return handleRpcRequest(request, {
				resolveFunction(/** @type {string} */ hash) {
					const entry = rpcLookup.get(hash);
					if (!entry) return null;
					const fn = entry.serverObj[entry.funcName];
					return typeof fn === 'function' ? fn : null;
				},
				describeFunction(/** @type {string} */ hash) {
					return rpcDescriptors?.get(hash) ?? null;
				},
				executeServerFunction,
				asyncContext,
				trustProxy,
				middlewares: globalMiddlewares,
				allowedOrigins: rpcPolicy?.allowedOrigins,
				maxBodyBytes: rpcPolicy?.maxBodyBytes,
				platform,
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

		const context = createContext(request, match.params, platform);

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
		const preparedRoute = preparedRenderRoutes.get(route);
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
			routeIndex: preparedRoute?.index,
			params: context.params,
			url: requestUrl,
			preHydrate: manifest.preHydrate ?? null,
			rootBoundary: manifest.rootBoundaryEntries ?? { pending: null, catch: null },
		});
		const dataScript = `<script id="__octane_data" type="application/json"${nonceAttribute(nonce)}>${escapeScript(routeData)}</script>`;

		// The page, layout, and configured root fallbacks can all contribute
		// server HTML before hydration. Their asset records also include CSS for
		// deferred Hydrate descendants, whose JavaScript must remain lazy. Keep
		// page CSS first, preserve each record's order, and link shared files once.
		let assetHead = preparedRoute?.assetHead;
		if (assetHead === undefined) {
			assetHead = prepareRouteAssetHead(manifest, route, entryPath);
			if (preparedRoute) preparedRoute.assetHead = assetHead;
		}
		const headContent = assetHead === '' ? dataScript : assetHead + '\n' + dataScript;
		const noncedTemplate = nonce === null ? null : applyHydrationNonce(htmlTemplate, nonce);

		const status = route.status ?? 200;
		const headers = { 'Content-Type': 'text/html; charset=utf-8' };

		// `headChannel: 'separate'` below: this handler renders the ROUTE into the
		// template's `<div id="root">`, not a document, so core's default fold has
		// no `</head>` to target and would prepend hoisted `<title>`/`<meta>`/
		// `<link>` into the body, where a title loses to the template's and a
		// canonical or description is ignored. Splicing at `<!--ssr-head-->`
		// instead is also what makes hydration's `document.head` adoption find the
		// ownership markers rather than creating duplicates.
		//
		// The replacement is a FUNCTION, not a string: a string replacement makes
		// `$&`, `` $` ``, `$'` and `$1` in the inserted text expand against the
		// match, and this text now carries author-controlled metadata as well as
		// the serialized route data.
		/** @param {string} hoistedHead */
		const splitAroundBody = (hoistedHead) => {
			const completeHead = headContent + hoistedHead;
			return noncedTemplate === null
				? splitHydrationTemplate(completeHead)
				: splitSsrTemplate(noncedTemplate.replace(HEAD_MARKER, () => completeHead));
		};

		if (manifest.render === 'buffered') {
			// Await-everything fallback (`prerender` from octane/static): no
			// streaming, one document. The deduped scoped-style tags lead the body
			// markup inside #root — the same position they hold in the streamed
			// shell — so hydrateRoot's leading-style skip applies unchanged.
			const {
				html: body,
				css,
				head,
			} = await prerender(RootComponent, undefined, {
				nonce: nonce ?? undefined,
				headChannel: 'separate',
				signal: context.request.signal,
				onError(/** @type {unknown} */ error) {
					console.error('[octane] SSR render error:', error);
				},
			});
			const [prefix, suffix] = splitAroundBody(head ?? '');
			return new Response(prefix + css + body + suffix, { status, headers });
		}

		// Streaming (default): shell flushes at first await, suspense segments
		// stream out-of-order behind it — identical to dev.
		let hoistedHead = '';
		/** @type {ReadableStream<Uint8Array>} */
		const renderStream = await renderToReadableStream(RootComponent, undefined, {
			nonce: nonce ?? undefined,
			headChannel: 'separate',
			// Fires before the shell is written, so the metadata is in hand before
			// the template prefix (which carries `<head>`) is composed below.
			onHeadReady(/** @type {string} */ head) {
				hoistedHead = head;
			},
			signal: context.request.signal,
			onError(/** @type {unknown} */ error) {
				console.error('[octane] SSR render error:', error);
			},
		});

		const [prefix, suffix] = splitAroundBody(hoistedHead);
		const body = composeHtmlStream(prefix, renderStream, suffix);

		return new Response(body, { status, headers });
	}

	return handler;
}

/**
 * Escape script content to prevent XSS in the inline JSON data block.
 * @param {string} str
 * @returns {string}
 */
function escapeScript(str) {
	return str.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
