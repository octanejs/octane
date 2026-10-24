import { stringify } from 'devalue';
import type { ServerCallOptions } from './server-call.js';
import {
	SERVER_RESULT_CONTENT_TYPE,
	ServerCallUncertainError,
	encodeServerArguments,
	serverResultLimits,
	type ResolvedServerResultLimits,
	type ServerResultLimits,
} from './server-rpc-protocol.js';

// Everything up to the request runs at call time: argument encoding, batch
// collection and abort checks are synchronous, and the request is sent before
// anything else loads. Only reading the response is on demand: a call made
// before the reader arrives fetches it alongside the server's reply.
type ResponseReader = typeof import('./server-rpc-response.js');
export let responseReader: ResponseReader | undefined;
let loadReader: (() => Promise<ResponseReader>) | undefined;
let loading: Promise<ResponseReader> | undefined;

export function loadResponseReader(): Promise<ResponseReader> {
	return (loading ??= loadReader!().then(
		(module) => (responseReader = module),
		(error) => {
			loading = undefined;
			throw error;
		},
	));
}

/**
 * Called through `octane/internal/server-rpc` by each module with server
 * function stubs, before any call: the page fetches the reader once it has
 * loaded and gone idle, off its critical path, so a first call does not share
 * the network with it. A failed preload leaves the first call to retry.
 */
export function registerResponseReader(load: () => Promise<ResponseReader>): void {
	if (loadReader) return;
	loadReader = load;
	if (typeof document === 'undefined') return;
	const preload = () => {
		const idle = () => void loadResponseReader().catch(() => {});
		if (typeof requestIdleCallback === 'function') requestIdleCallback(idle);
		else setTimeout(idle, 0);
	};
	if (document.readyState === 'complete') preload();
	else addEventListener('load', preload, { once: true });
}

type Batcher = (
	hash: string,
	body: string,
	options: ServerCallOptions,
	limits?: ServerResultLimits,
) => Promise<unknown> | undefined;
let batcher: Batcher | undefined;

/** @internal Installed by the first `batchServerCalls`. */
export function setServerCallBatcher(enqueue: Batcher): void {
	batcher = enqueue;
}

// The native getter validates the AbortSignal brand across same-origin realms.
const signalAborted = /* @__PURE__ */ (() =>
	typeof AbortSignal === 'undefined'
		? undefined
		: Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get)();
function isAbortSignal(signal: unknown): signal is AbortSignal {
	if (signalAborted === undefined) return false;
	try {
		signalAborted.call(signal);
		return true;
	} catch {
		return false;
	}
}

function validateServerCallOptions(options: ServerCallOptions): void {
	if (
		options === null ||
		typeof options !== 'object' ||
		Object.keys(options).some((key) => key !== 'signal') ||
		(options.signal !== undefined && !isAbortSignal(options.signal))
	)
		throw new TypeError('Server function options accept only a genuine AbortSignal');
	options.signal?.throwIfAborted();
}

// An authored <base> must not redirect calls away from this page's server.
export function post(
	hash: string,
	body: string,
	accept: string | undefined,
	signal: AbortSignal | undefined,
): Promise<Response> {
	try {
		return fetch(new URL('/_$_ripple_rpc_$_/' + hash, globalThis.location.href).href, {
			method: 'POST',
			headers:
				accept === undefined
					? { 'Content-Type': 'application/json' }
					: { 'Content-Type': 'application/json', Accept: accept },
			body,
			signal: signal ?? null,
		});
	} catch (error) {
		return Promise.reject(error);
	}
}

/**
 * Compiler target for browser calls to a `module server` export.
 * @internal
 */
export function __serverRpc(
	hash: string,
	args: unknown[],
	options: ServerCallOptions = {},
	stream = false,
	limits?: ServerResultLimits,
): Promise<unknown> {
	if (stream) return __serverRpcStream(hash, args, options, limits);
	try {
		validateServerCallOptions(options);
		// Encoding can fail (for example an unresolved Promise); never dispatch first.
		return send(hash, stringify(args), options.signal, undefined);
	} catch (error) {
		return Promise.reject(error);
	}
}

/**
 * Compiler target for browser calls to a `module server` export that takes a
 * server call context: the streamed result protocol.
 * @internal
 */
export function __serverRpcStream(
	hash: string,
	args: unknown[],
	options: ServerCallOptions = {},
	limits?: ServerResultLimits,
): Promise<unknown> {
	try {
		validateServerCallOptions(options);
		const resolvedLimits = serverResultLimits(limits);
		const payload = encodeServerArguments(args);
		const batched = batcher ? batcher(hash, payload, options, limits) : undefined;
		return batched ?? send(hash, payload, options.signal, resolvedLimits);
	} catch (error) {
		return Promise.reject(error);
	}
}

function send(
	hash: string,
	payload: string,
	callerSignal: AbortSignal | undefined,
	limits: ResolvedServerResultLimits | undefined,
): Promise<unknown> {
	const deadline = limits === undefined ? undefined : Date.now() + limits.timeoutMs;
	const cancellation = limits === undefined ? undefined : new AbortController();
	const timer =
		limits === undefined
			? undefined
			: setTimeout(() => {
					cancellation!.abort(new DOMException('Server function timed out', 'TimeoutError'));
				}, limits.timeoutMs);
	const signal =
		cancellation === undefined
			? callerSignal
			: callerSignal === undefined
				? cancellation.signal
				: AbortSignal.any([callerSignal, cancellation.signal]);
	const response = post(
		hash,
		payload,
		limits === undefined ? undefined : SERVER_RESULT_CONTENT_TYPE,
		signal,
	);
	if (responseReader)
		return responseReader.readServerResponse(response, timer, deadline, limits, signal);
	return new Promise((resolve, reject) => {
		// A request that fails (or is aborted) before the reader arrives settles
		// now, as it would with the reader loaded.
		let failed = false;
		response.catch((cause) => {
			failed = true;
			clearTimeout(timer);
			reject(requestFailed(cause));
		});
		loadResponseReader().then(
			(module) => {
				if (!failed) resolve(module.readServerResponse(response, timer, deadline, limits, signal));
			},
			(error) => {
				clearTimeout(timer);
				reject(new ServerCallUncertainError(error));
			},
		);
	});
}

/** @internal The request never produced a response, so its outcome is unknown. */
export function requestFailed(cause: unknown): ServerCallUncertainError {
	return new ServerCallUncertainError(
		new Error('An error occurred while trying to call the Octane server function.', { cause }),
	);
}
