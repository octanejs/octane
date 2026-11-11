// @ts-check
/**
 * `module server` functions for a Node server an Octane integration does not
 * own: one with its own routing, or pages another renderer draws. It applies
 * the same boundary as `@octanejs/vite-plugin` and `@octanejs/rsbuild-plugin`,
 * so it works under any bundler that compiles `.tsrx` for the server.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { build_rpc_lookup, is_rpc_request } from '@ripple-ts/adapter/rpc';
import {
	executeServerFunction,
	executeServerFunctionBatch,
	executeServerFunctionStream,
} from 'octane/server';
import { createContext, runMiddlewareChain } from './middleware.js';
import { buildRpcDescriptors } from './rpc-registry.js';
import { handleRpcRequest } from './rpc.js';
import { setRequestContextSource } from './request-context.js';
import { createServerCallHost } from './server-calls.js';
import { runServerRequest } from './signal-owners.js';

/** The compiler's function id: SHA-256 hex of `"<module>#<export>"`, 8 characters. */
const hash = (/** @type {string} */ value) =>
	createHash('sha256').update(value).digest('hex').slice(0, 8);

/**
 * @param {import('@octanejs/app-core/server-functions').ServerFunctionsOptions} options
 * @returns {import('@octanejs/app-core/server-functions').ServerFunctions}
 */
export function createServerFunctions(options) {
	/** @type {Record<string, Record<string, Function>>} */
	const namespaces = {};
	for (const [id, module] of Object.entries(options.modules)) {
		const server = /** @type {Record<string, Function> | undefined} */ (module._$_server_$_);
		if (server === undefined) {
			throw new TypeError(`[octane] ${id} has no \`module server\` block in this build`);
		}
		namespaces[id] = server;
	}
	const lookup = build_rpc_lookup(namespaces, hash);
	const descriptors = buildRpcDescriptors(namespaces, hash);
	const middlewares = options.middlewares ?? [];
	const storage = new AsyncLocalStorage();
	/** @type {import('@octanejs/app-core').RpcRequestOptions['asyncContext']} */
	const asyncContext = {
		run: (store, fn) => storage.run(store, fn),
		getStore: () => storage.getStore(),
	};

	return {
		handle(request, platform) {
			if (!is_rpc_request(new URL(request.url).pathname)) return null;
			return handleRpcRequest(request, {
				resolveFunction(id) {
					const entry = lookup.get(id);
					const fn = entry?.serverObj[entry.funcName];
					return typeof fn === 'function' ? fn : null;
				},
				describeFunction: (id) => descriptors.get(id) ?? null,
				executeServerFunction,
				streamServerFunction: executeServerFunctionStream,
				batchServerFunctions: executeServerFunctionBatch,
				asyncContext,
				middlewares,
				trustProxy: options.trustProxy,
				allowedOrigins: options.allowedOrigins,
				maxBodyBytes: options.maxBodyBytes,
				resultLimits: options.resultLimits,
				platform,
			});
		},
		respond(request, respond, platform) {
			const context = createContext(request, {}, platform);
			const origin = context.url.origin;
			setRequestContextSource(asyncContext);
			return runServerRequest(
				asyncContext,
				{
					origin,
					platform,
					context,
					serverCallHost: createServerCallHost(context, { asyncContext, middlewares, origin }),
				},
				undefined,
				() => runMiddlewareChain(context, middlewares, [], async () => respond(context)),
			);
		},
	};
}
