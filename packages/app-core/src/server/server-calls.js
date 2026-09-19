// @ts-check
import { createContext, runMiddlewareChain } from './middleware.js';

/**
 * Snapshot trusted middleware output only after this invocation was authorized.
 * @param {import('@octanejs/app-core').Context} context
 * @param {AbortSignal} [signal]
 * @returns {import('octane/server').ServerCallContext}
 */
export function serverCallContext(context, signal = context.request.signal) {
	return Object.freeze({
		request: context.request,
		signal,
		viewer: context.viewer,
		...(context.platform === undefined ? {} : { platform: context.platform }),
	});
}

/**
 * Each nested call gets a separate middleware context and async store. Reusing
 * the parent's mutable `rpc` field would cross-authorize concurrent members.
 * @param {import('@octanejs/app-core').Context} parent
 * @param {Pick<import('@octanejs/app-core').RpcRequestOptions, 'asyncContext' | 'middlewares'> & { origin: string }} options
 * @returns {import('octane/server').ServerCallHost}
 */
export function createServerCallHost(parent, options) {
	return {
		/**
		 * @template T
		 * @param {import('octane/server').ServerFunctionTarget} target
		 * @param {import('octane/server').ServerCallOptions} callOptions
		 * @param {(context: import('octane/server').ServerCallContext) => T} execute
		 * @returns {Promise<Awaited<T>>}
		 */
		async invoke(target, callOptions, execute) {
			const signal =
				callOptions.signal === undefined
					? parent.request.signal
					: AbortSignal.any([parent.request.signal, callOptions.signal]);
			signal.throwIfAborted();
			const context = createContext(parent.request, { ...parent.params }, parent.platform);
			context.state = new Map(parent.state);
			context.viewer = parent.viewer;
			context.rpc = Object.freeze({ ...target });
			const store = {
				signalRequestContext:
					options.asyncContext.getStore()?.signalRequestContext ??
					options.asyncContext.getStore()?.context ??
					parent,
				origin: options.origin,
				context,
				platform: parent.platform,
				serverCallHost: createServerCallHost(context, options),
			};
			return await options.asyncContext.run(store, async () => {
				let invoked = false;
				/** @type {{ value: Awaited<T> } | undefined} */
				let result;
				const response = await runMiddlewareChain(
					context,
					options.middlewares ?? [],
					[],
					async () => {
						signal.throwIfAborted();
						invoked = true;
						result = { value: await execute(serverCallContext(context, signal)) };
						return new Response(null, { status: 204 });
					},
				);
				if (!invoked || !response.ok || result === undefined) {
					throw Object.assign(new Error('Server function call was rejected by middleware'), {
						code: 'OCTANE_SERVER_CALL_REJECTED',
						status: response.ok ? 403 : response.status,
						invoked,
					});
				}
				const value = result.value;
				// Async generators execute on next(), not when their function returns.
				// Keep those later pulls in this invocation's authorized request store.
				if (value !== null && typeof value === 'object' && Symbol.asyncIterator in value) {
					const iterable = /** @type {AsyncIterable<unknown>} */ (value);
					return /** @type {typeof value} */ ({
						[Symbol.asyncIterator]() {
							const iterator = Promise.resolve(
								options.asyncContext.run(store, () => iterable[Symbol.asyncIterator]()),
							);
							let closed = false;
							const close = () => {
								if (closed) return Promise.resolve({ done: true, value: undefined });
								closed = true;
								signal.removeEventListener('abort', abort);
								return iterator.then((producer) =>
									options.asyncContext.run(
										store,
										() => producer.return?.() ?? { done: true, value: undefined },
									),
								);
							};
							const abort = () => {
								void close().catch(() => {});
							};
							signal.addEventListener('abort', abort, { once: true });
							return {
								async next() {
									try {
										signal.throwIfAborted();
										if (closed) return { done: true, value: undefined };
										const producer = await iterator;
										if (closed) return { done: true, value: undefined };
										const result = await options.asyncContext.run(store, () => producer.next());
										signal.throwIfAborted();
										if (closed) return { done: true, value: undefined };
										if (result.done) {
											closed = true;
											signal.removeEventListener('abort', abort);
										}
										return result;
									} catch (error) {
										void close().catch(() => {});
										throw error;
									}
								},
								return: close,
							};
						},
					});
				}
				return value;
			});
		},
	};
}
