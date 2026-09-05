// @ts-check
/**
 * @typedef {import('@octanejs/app-core').Context} Context
 * @typedef {import('@octanejs/app-core').ServerRoute} ServerRoute
 * @typedef {import('@octanejs/app-core').Middleware} Middleware
 */

import { runMiddlewareChain } from './middleware.js';

/**
 * Handle a ServerRoute (API endpoint)
 *
 * @param {ServerRoute} route
 * @param {Context} context
 * @param {Middleware[]} globalMiddlewares
 * @returns {Promise<Response>}
 */
export async function handleServerRoute(route, context, globalMiddlewares) {
	try {
		// The handler wrapped as a function returning Promise<Response>
		const handler = async () => {
			return route.handler(context);
		};

		// Run the middleware chain: global → before → handler → after
		const response = await runMiddlewareChain(
			context,
			globalMiddlewares,
			route.before,
			handler,
			route.after,
		);

		return response;
	} catch (error) {
		console.error('[octane] API route error:', error);

		// Thrown messages can contain credentials or internal details. The server
		// log above retains the original error for diagnostics.
		return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
}
