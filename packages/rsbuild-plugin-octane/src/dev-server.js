// @ts-check
import { createHandler } from '@octanejs/app-core/production';
import { createRouter, is_rpc_request } from '@octanejs/app-core';
import { nodeRequestToWebRequest, sendWebResponse } from '@octanejs/app-core/node';

import { isRsbuildOwnedUrl } from './html.js';

/**
 * @typedef {{
 *   manifest: import('@octanejs/app-core/production').ServerManifest,
 *   rendererDeps: Omit<import('@octanejs/app-core/production').HandlerOptions, 'htmlTemplate'>,
 * }} OctaneDevBundle
 */

/**
 * @param {import('@rspack/core').Stats} stats
 * @returns {Set<string>}
 */
function collectAssetPaths(stats) {
	const json = stats.toJson({ all: false, assets: true });
	const paths = new Set();
	for (const asset of json.assets ?? []) {
		if (!asset.name) continue;
		paths.add(asset.name);
		paths.add('/' + asset.name.replace(/^\/+/, ''));
	}
	return paths;
}

/**
 * Create the early Connect middleware used by the Rsbuild Environment API.
 * Asset/internal requests fall through to Rsbuild; matched app/RPC requests
 * load the current server bundle and stream a Web Response back to Node.
 *
 * @param {{
 *   server: import('@rsbuild/core').RsbuildDevServer,
 *   clientEnvironment: string,
 *   serverEnvironment: string,
 *   clientEntry: string,
 *   serverEntry: string,
 *   publicRoots?: string[],
 *   logError?: (message: string, error: unknown) => void,
 * }} options
 * @returns {import('@rsbuild/core').RequestHandler}
 */
export function createOctaneDevMiddleware(options) {
	const clientApi = options.server.environments[options.clientEnvironment];
	const serverApi = options.server.environments[options.serverEnvironment];
	if (!clientApi || !serverApi) {
		throw new Error(
			`[@octanejs/rsbuild-plugin] Missing Rsbuild environments ${JSON.stringify(options.clientEnvironment)} and ${JSON.stringify(options.serverEnvironment)}.`,
		);
	}

	let assetHash = '';
	let assetPaths = new Set();
	/** @type {WeakMap<object, { html: string, handler: (request: Request) => Promise<Response> }>} */
	const handlerCache = new WeakMap();

	return async function octaneDevMiddleware(request, response, next) {
		try {
			const host = request.headers.host ?? 'localhost';
			const url = new URL(request.url ?? '/', `http://${host}`);
			// Internal and public URLs do not depend on a successful client
			// compilation. Yield them immediately so an initial compile error does
			// not turn the error overlay, HMR transport, or favicon into an SSR 500.
			if (isRsbuildOwnedUrl(url, new Set(), options.publicRoots)) {
				next();
				return;
			}
			const clientStats = await clientApi.getStats();
			if (clientStats.hash !== assetHash) {
				assetHash = clientStats.hash ?? '';
				assetPaths = collectAssetPaths(clientStats);
			}
			if (isRsbuildOwnedUrl(url, assetPaths)) {
				next();
				return;
			}

			const bundle = await serverApi.loadBundle(options.serverEntry);
			if (!bundle || typeof bundle !== 'object') {
				throw new Error('The Octane server environment returned an invalid bundle.');
			}
			const typedBundle = /** @type {OctaneDevBundle} */ (bundle);
			const method = request.method ?? 'GET';
			const route = createRouter(typedBundle.manifest.routes).match(method, url.pathname);
			if (!route && !is_rpc_request(url.pathname)) {
				next();
				return;
			}

			const html = await clientApi.getTransformedHtml(options.clientEntry);
			let cached = handlerCache.get(typedBundle.manifest);
			if (!cached || cached.html !== html) {
				cached = {
					html,
					handler: createHandler(typedBundle.manifest, {
						...typedBundle.rendererDeps,
						htmlTemplate: html,
					}),
				};
				handlerCache.set(typedBundle.manifest, cached);
			}

			const webResponse = await cached.handler(nodeRequestToWebRequest(request));
			await sendWebResponse(response, webResponse);
		} catch (error) {
			options.logError?.('Dev SSR request failed', error);
			if (!response.headersSent) {
				response.statusCode = 500;
				response.setHeader('Content-Type', 'text/plain; charset=utf-8');
			}
			response.end('Internal Server Error');
		}
	};
}
