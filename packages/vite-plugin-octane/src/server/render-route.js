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
 * octane RenderResult — imported from 'octane/server' (the single source of
 * truth) rather than re-declared, so the shape can't silently drift. Note
 * `renderToString()` is ASYNC and `css` is ALREADY a deduped
 * `<style data-octane="hash">…</style>` string (NOT a Set<string> needing a
 * `get_css_for_hashes` lookup like Ripple), so CSS handling here is identity.
 *
 * @typedef {import('octane/server').RenderResult} RenderResult
 */

/**
 * Handle SSR rendering for a RenderRoute (dev).
 *
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

		// Load the octane server runtime. The wrappers call components directly
		// (no ssrComponent injection — the root must NOT be marker-wrapped), so
		// only `renderToString` is needed here.
		const { renderToString } = await vite.ssrLoadModule('octane/server');

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

		// Build the component tree (with optional layout).
		let RootComponent;
		const pageProps = { params: context.params };

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

		// Render to HTML. `head` carries the hoisted <title>/<meta>/<link> markup;
		// `body` already contains any inline <script data-octane-suspense> seed.
		/** @type {RenderResult} */
		const { head, body, css } = await renderToString(RootComponent);

		// CSS is already a ready <style> string (or '') — identity, no re-wrapping.
		const cssContent = css || '';

		// Build head content with hydration data. The client entry is CONFIG-FREE
		// (importing octane.config.ts into the browser would drag the plugin + the
		// server adapter — and their `node:fs` imports — into the client graph and
		// break at module-eval). So everything the client needs to pick + import
		// the page/layout is serialized HERE: entry path, export name, layout path,
		// and params. routeIndex stays for debugging / Phase-2 static maps.
		const routeData = JSON.stringify({
			entry: entryPath,
			exportName: get_route_entry_export_name(route.entry) ?? null,
			layout: route.layout ?? null,
			routeIndex: getRenderRouteIndex(octaneConfig, route),
			params: context.params,
		});
		const headContent = [
			head,
			cssContent,
			`<script id="__octane_data" type="application/json">${escapeScript(routeData)}</script>`,
		]
			.filter(Boolean)
			.join('\n');

		// Load and process index.html template.
		const templatePath = join(vite.config.root, 'index.html');
		let template = await readFile(templatePath, 'utf-8');

		// Apply Vite's HTML transforms (HMR client, module resolution, etc.).
		template = await vite.transformIndexHtml(context.url.pathname, template);

		// Replace placeholders.
		let html = template.replace('<!--ssr-head-->', headContent).replace('<!--ssr-body-->', body);

		// Inject the hydration entry before </body>.
		const hydrationScript = `<script type="module" src="/@id/virtual:octane-hydrate"></script>`;
		html = html.replace('</body>', `${hydrationScript}\n</body>`);

		return new Response(html, {
			status: 200,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
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
