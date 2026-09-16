// @ts-check
/** @typedef {import('@octanejs/app-core').RpcRequestOptions['asyncContext']} RequestStorage */
/** @typedef {NonNullable<ReturnType<RequestStorage['getStore']>>} RequestStore */
/** @typedef {import('@octanejs/app-core').SignalRequestHooks} SignalRequestHooks */

/** @type {WeakMap<object, WeakSet<SignalRequestHooks['install']>>} */
const installed = new WeakMap();
/** @type {WeakMap<object, import('octane/server').SignalOwner>} */
const owners = new WeakMap();
const retired = new WeakSet();

/**
 * Signal reads are synchronous even though the adapter's broad run() type also
 * permits an async wrapper. Capture the callback's actual result, and fail
 * clearly (without invoking delayed work) if the provider defers entry itself.
 * @template T
 * @param {RequestStorage} storage
 * @param {RequestStore} store
 * @param {() => T} callback
 * @returns {T}
 */
function runSynchronous(storage, store, callback) {
	/** @type {{ value: T } | { error: unknown } | undefined} */
	let outcome;
	let entering = true;
	try {
		const pending = storage.run(store, () => {
			if (!entering) return;
			try {
				outcome = { value: callback() };
			} catch (error) {
				outcome = { error };
			}
		});
		// Callback exceptions are preserved in outcome; an async context wrapper
		// must not leave an unobserved promise when synchronous entry is rejected.
		if (pending !== undefined) void Promise.resolve(pending).catch(() => {});
	} finally {
		entering = false;
	}
	if (outcome === undefined)
		throw new Error('Signal owners require synchronous request-context entry');
	if ('error' in outcome) throw outcome.error;
	return outcome.value;
}

/**
 * @param {RequestStorage} storage
 * @param {SignalRequestHooks} hooks
 */
function install(storage, hooks) {
	let environments = installed.get(storage);
	if (environments?.has(hooks.install)) return;
	if (!environments) {
		environments = new WeakSet();
		installed.set(storage, environments);
	}
	/** @param {RequestStore | undefined} store */
	const rootContext = (store) => store?.signalRequestContext ?? store?.context;
	hooks.install({
		current() {
			const store = storage.getStore();
			const root = rootContext(store);
			if (root && retired.has(root)) throw new Error('The signal request owner has retired');
			if (store?.signalOwner !== undefined) return store.signalOwner;
			if (!root) return null;
			let owner = owners.get(root);
			if (!owner) {
				owner = Object.freeze({ scopeKey: 'octane:document' });
				owners.set(root, owner);
			}
			return owner;
		},
		run(owner, callback) {
			const store = storage.getStore();
			return runSynchronous(
				storage,
				{ ...store, signalOwner: owner, signalRequestContext: rootContext(store) },
				callback,
			);
		},
		capture(owner) {
			// Capture the request now, not whichever request later invokes this callback.
			const store = storage.getStore();
			return (callback) =>
				runSynchronous(
					storage,
					{ ...store, signalOwner: owner, signalRequestContext: rootContext(store) },
					callback,
				);
		},
	});
	environments.add(hooks.install);
}

/**
 * Keep one lazy signal identity through middleware, sibling renders, and later
 * response pulls. Completion retires the subscription owner, never a separately
 * accepted durable server operation.
 * @param {RequestStorage} storage
 * @param {RequestStore} store
 * @param {SignalRequestHooks | undefined} hooks
 * @param {() => Promise<Response>} callback
 * @returns {Promise<Response>}
 */
export async function runServerRequest(storage, store, hooks, callback) {
	if (hooks === undefined) return storage.run(store, callback);
	install(storage, hooks);
	const root = store.signalRequestContext ?? store.context;
	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		store.context?.request.signal.removeEventListener('abort', abort);
		if (root) {
			retired.add(root);
			const owner = owners.get(root);
			if (owner) hooks.retire(owner);
		}
	};
	/** @type {ReadableStreamDefaultReader<Uint8Array> | undefined} */
	let reader;
	const abort = () => {
		// Cancel before retirement so iterator finally blocks still have their owner.
		const pending = storage.run(store, () => reader?.cancel());
		finish();
		void Promise.resolve(pending).catch(() => {});
	};
	try {
		const response = await storage.run(store, callback);
		if (response.body === null) {
			finish();
			return response;
		}
		reader = response.body.getReader();
		const bodyReader = reader;
		store.context?.request.signal.addEventListener('abort', abort, { once: true });
		if (store.context?.request.signal.aborted) abort();
		return new Response(
			new ReadableStream(
				{
					pull(controller) {
						return storage.run(store, async () => {
							try {
								const item = await bodyReader.read();
								if (item.done) {
									bodyReader.releaseLock();
									finish();
									controller.close();
								} else controller.enqueue(item.value);
							} catch (error) {
								finish();
								controller.error(error);
							}
						});
					},
					cancel(reason) {
						return storage.run(store, async () => {
							try {
								const pending = bodyReader.cancel(reason);
								finish();
								await pending;
							} finally {
								bodyReader.releaseLock();
								finish();
							}
						});
					},
				},
				{ highWaterMark: 0 },
			),
			{
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			},
		);
	} catch (error) {
		finish();
		throw error;
	}
}
