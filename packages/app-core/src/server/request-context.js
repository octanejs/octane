// @ts-check
/**
 * Request-scoped context lookup for `module server` functions.
 *
 * A server function is loaded through the SSR module graph in dev and through
 * the server manifest in production, so the `@octanejs/app-core` instance it
 * imports is not necessarily the one that handled the request. The active async
 * context is therefore published on a `Symbol.for` global, the same technique
 * the fetch coordinator uses, so every evaluated copy resolves the one live
 * store.
 *
 * The holder tracks one boundary, which is what a process has: dev serves RPC
 * through the plugin's single async context and production through the single
 * fetch coordinator. A process running two boundaries concurrently would see the
 * later registration win, and a server function under the earlier one reports no
 * request rather than the wrong one.
 */

/**
 * @typedef {import('@octanejs/app-core').Context} Context
 * @typedef {import('@ripple-ts/adapter/rpc').AsyncContext<{ origin?: string, platform?: unknown, context?: Context }>} RequestAsyncContext
 * @typedef {{ asyncContext: RequestAsyncContext }} RequestContextHolder
 */

const REQUEST_CONTEXT_KEY = Symbol.for('octane.app-core.request-context');

const globals =
	/** @type {typeof globalThis & { [REQUEST_CONTEXT_KEY]?: RequestContextHolder }} */ (globalThis);

/**
 * Publish the async context a request boundary runs its handler inside. Called
 * per request from `handleRpcRequest` rather than once at construction so any
 * embedder of that boundary is covered without a second registration step; the
 * identity check keeps the steady state a read.
 *
 * @param {RequestAsyncContext} asyncContext
 * @returns {void}
 */
export function setRequestContextSource(asyncContext) {
	const current = globals[REQUEST_CONTEXT_KEY];
	if (current === undefined) {
		globals[REQUEST_CONTEXT_KEY] = { asyncContext };
	} else if (current.asyncContext !== asyncContext) {
		current.asyncContext = asyncContext;
	}
}

/**
 * The `Context` for the in-flight request, or `null` when there is none.
 *
 * @returns {Context | null}
 */
export function tryGetRequestContext() {
	return globals[REQUEST_CONTEXT_KEY]?.asyncContext.getStore()?.context ?? null;
}

/**
 * The `Context` for the in-flight request.
 *
 * @returns {Context}
 */
export function getRequestContext() {
	const context = tryGetRequestContext();
	if (context === null) {
		throw new Error(
			'[octane] getRequestContext() was called outside of a request. It is available inside ' +
				'`module server` functions and the middleware chain that runs them. Use ' +
				'tryGetRequestContext() for code that must also run outside a request.',
		);
	}
	return context;
}
