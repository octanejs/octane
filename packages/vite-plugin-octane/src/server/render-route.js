// @ts-check
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLayoutWrapper, createPropsWrapper } from './component-wrappers.js';
import {
	get_component_export,
	get_route_entry_export_name,
	get_route_entry_path,
} from '../routes.js';

/**
 * @typedef {import('@octanejs/vite-plugin').Context} Context
 * @typedef {import('@octanejs/vite-plugin').RenderRoute} RenderRoute
 * @typedef {import('@octanejs/vite-plugin').ResolvedOctaneConfig} ResolvedOctaneConfig
 * @typedef {import('vite').ViteDevServer} ViteDevServer
 */

/**
 * Handle SSR rendering for a RenderRoute (dev) — STREAMING.
 *
 * The render uses octane's `renderToReadableStream` (octane/server): the shell
 * (with `@pending` fallbacks for anything still suspended) flushes as soon as
 * it is ready, and each suspense boundary streams later as a hidden segment +
 * an inline `$OCTRC` swap script, so a slow `use(thenable)` no longer blocks
 * TTFB the way the old buffered `prerender` did. Consequences of streaming:
 *
 *   - Scoped CSS rides the STREAM (the shell emits its deduped
 *     `<style data-octane>` tags ahead of the body markup, per-wave styles ride
 *     their segment chunk), so nothing is spliced into `<!--ssr-head-->`
 *     anymore — only the hydration data script goes there. `hydrateRoot()`
 *     skips the shell's leading style tags when adopting.
 *   - A render error BEFORE the shell completes still produces the dev 500
 *     page (`renderToReadableStream` rejects on shell errors). An error AFTER
 *     the shell (a rejected `use(thenable)` with no `@catch`) can't change the
 *     status — the stream ends with `$OCTRX` markers and hydration
 *     client-renders the affected boundaries.
 */

/**
 * @param {RenderRoute} route
 * @param {Context} context
 * @param {ViteDevServer} vite
 * @param {ResolvedOctaneConfig} [octaneConfig]
 * @returns {Promise<Response>}
 */
export async function handleRenderRoute(route, context, vite, octaneConfig) {
	try {
		// Initialize so the server can register RPC functions from `module server`
		// declarations during SSR module loading (renderer-agnostic; harmless when
		// the app uses no RPC).
		if (!(/** @type {any} */ (globalThis).rpc_modules)) {
			/** @type {any} */ (globalThis).rpc_modules = new Map();
		}

		// Load the octane streaming renderer. The wrappers call components
		// directly (no ssrComponent injection — the root must NOT be
		// marker-wrapped).
		const { renderToReadableStream } = await vite.ssrLoadModule('octane/server');

		// Load the page component (compiled in server mode by octane()).
		const entryPath = get_route_entry_path(route.entry);
		const pageModule = await vite.ssrLoadModule(/** @type {string} */ (entryPath));
		const PageComponent = get_component_export(
			pageModule,
			get_route_entry_export_name(route.entry),
		);

		if (!PageComponent) {
			throw new Error(`No component found for route ${route.path}`);
		}

		// Build the component tree (with optional layout). Every RenderRoute
		// component receives the request `url` (pathname + search — origin-free so
		// the identical string re-renders on the client) alongside its `params`,
		// so an app-level router can match without baking the URL into per-route
		// entry exports.
		let RootComponent;
		const requestUrl = context.url.pathname + context.url.search;
		const pageProps = { params: context.params, url: requestUrl };

		if (route.layout) {
			const layoutModule = await vite.ssrLoadModule(route.layout);
			const LayoutComponent = get_component_export(layoutModule, undefined);

			if (!LayoutComponent) {
				throw new Error(`No default export found in ${route.layout}`);
			}

			RootComponent = createLayoutWrapper(
				/** @type {any} */ (LayoutComponent),
				/** @type {any} */ (PageComponent),
				pageProps,
			);
		} else {
			RootComponent = createPropsWrapper(/** @type {any} */ (PageComponent), pageProps);
		}

		// Build head content with hydration data. The client entry is CONFIG-FREE
		// (importing octane.config.ts into the browser would drag the plugin + the
		// server adapter — and their `node:fs` imports — into the client graph and
		// break at module-eval). So everything the client needs to pick + import
		// the page/layout is serialized HERE: entry path, export name, layout path,
		// params, the request url, and the optional preHydrate module the client
		// entry awaits before hydrateRoot. routeIndex stays for debugging /
		// Phase-2 static maps.
		const routeData = JSON.stringify({
			entry: entryPath,
			exportName: get_route_entry_export_name(route.entry) ?? null,
			layout: route.layout ?? null,
			routeIndex: getRenderRouteIndex(octaneConfig, route),
			params: context.params,
			url: requestUrl,
			preHydrate: octaneConfig?.router.preHydrate ?? null,
		});
		const headContent = `<script id="__octane_data" type="application/json">${escapeScript(routeData)}</script>`;

		// Load and process index.html template.
		const templatePath = join(vite.config.root, 'index.html');
		let template = await readFile(templatePath, 'utf-8');

		// Apply Vite's HTML transforms (HMR client, module resolution, etc.).
		template = await vite.transformIndexHtml(context.url.pathname, template);

		let html = template.replace('<!--ssr-head-->', headContent);

		// Inject the hydration entry before </body>.
		const hydrationScript = `<script type="module" src="/@id/virtual:octane-hydrate"></script>`;
		html = html.replace('</body>', `${hydrationScript}\n</body>`);

		// Start the render. This await resolves at SHELL-ready (so a synchronous
		// render error still falls into the catch below and produces the dev 500
		// page); segments keep flushing through the returned stream afterwards.
		/** @type {ReadableStream<Uint8Array>} */
		const renderStream = await renderToReadableStream(RootComponent, undefined, {
			onError(/** @type {unknown} */ error) {
				if (error instanceof Error) vite.ssrFixStacktrace(error);
				console.error('[octane] SSR render error:', error);
			},
		});

		const status = route.status ?? 200;
		const headers = { 'Content-Type': 'text/html; charset=utf-8' };

		// No body placeholder → nothing to stream into; cancel the render and
		// serve the transformed template (matches the old buffered behavior).
		const splitAt = html.indexOf('<!--ssr-body-->');
		if (splitAt === -1) {
			await renderStream.cancel();
			return new Response(html, { status, headers });
		}
		const prefix = html.slice(0, splitAt);
		const suffix = html.slice(splitAt + '<!--ssr-body-->'.length);

		// Template prefix → render stream (shell, then out-of-order segments) →
		// template suffix. The hydration <script> is in the SUFFIX, so by the time
		// the browser requests the entry every segment is already in the DOM.
		const encoder = new TextEncoder();
		const body = new ReadableStream({
			async start(controller) {
				controller.enqueue(encoder.encode(prefix));
				const reader = renderStream.getReader();
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						controller.enqueue(value);
					}
					controller.enqueue(encoder.encode(suffix));
					controller.close();
				} catch (error) {
					controller.error(error);
				} finally {
					reader.releaseLock();
				}
			},
			cancel(reason) {
				return renderStream.cancel(reason);
			},
		});

		return new Response(body, { status, headers });
	} catch (error) {
		console.error('[octane] SSR render error:', error);

		const errorHtml = generateErrorHtml(error, route);
		return new Response(errorHtml, {
			status: 500,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
	}
}

/**
 * @param {ResolvedOctaneConfig | undefined} config
 * @param {RenderRoute} route
 * @returns {number | undefined}
 */
function getRenderRouteIndex(config, route) {
	if (!config) {
		return undefined;
	}
	const renderRoutes = config.router.routes.filter((r) => r.type === 'render');
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

/**
 * Generate an error HTML page for development.
 *
 * @param {unknown} error
 * @param {RenderRoute} route
 * @returns {string}
 */
function generateErrorHtml(error, route) {
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SSR Error</title>
<style>
body { font-family: system-ui, sans-serif; padding: 2rem; background: #1a1a1a; color: #fff; }
h1 { color: #ff6b6b; }
pre { background: #2d2d2d; padding: 1rem; border-radius: 4px; overflow-x: auto; }
.route { color: #888; }
</style>
</head>
<body>
<h1>SSR Render Error</h1>
<p class="route">Route: ${route.path} → ${route.entry}</p>
<pre>${escapeHtml(message)}</pre>
${stack ? `<pre>${escapeHtml(stack)}</pre>` : ''}
</body>
</html>`;
}

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
