// @ts-check
/**
 * Bundler-neutral, security-owning server-function request boundary.
 *
 * The Ripple adapter owns the existing wire path, hash lookup, proxy-origin
 * derivation, and request-scoped fetch primitives. Octane owns which requests
 * may cross its server-function boundary, the bounded body reader, application
 * authorization middleware, and production-safe error disclosure.
 */

import { derive_origin } from '@ripple-ts/adapter/rpc';

import { DEFAULT_RPC_MAX_BODY_BYTES } from '../constants.js';
import { createContext, runMiddlewareChain } from './middleware.js';

const RPC_PATH_PREFIX = '/_$_ripple_rpc_$_/';

/**
 * @param {number} status
 * @param {string} message
 * @param {HeadersInit} [headers]
 * @returns {Response}
 */
function rpcError(status, message, headers) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
	});
}

/**
 * @param {Request} request
 * @param {boolean} trustProxy
 * @param {readonly string[]} allowedOrigins
 * @returns {string | null}
 */
function allowedRequestOrigin(request, trustProxy, allowedOrigins) {
	let requestOrigin;
	try {
		requestOrigin = new URL(derive_origin(request, trustProxy)).origin;
	} catch {
		return null;
	}

	const browserOrigin = request.headers.get('origin');
	if (browserOrigin === null) {
		return request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site'
			? null
			: requestOrigin;
	}

	let normalizedBrowserOrigin;
	try {
		normalizedBrowserOrigin = new URL(browserOrigin).origin;
	} catch {
		return null;
	}
	if (normalizedBrowserOrigin !== browserOrigin) return null;

	return normalizedBrowserOrigin === requestOrigin ||
		allowedOrigins.includes(normalizedBrowserOrigin)
		? requestOrigin
		: null;
}

/**
 * @param {Response} response
 * @param {string | null} origin
 * @returns {Response}
 */
function withRpcCors(response, origin) {
	if (origin === null) return response;

	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', origin);
	headers.append('Vary', 'Origin');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * @param {Request} request
 * @param {number} maxBodyBytes
 * @returns {Promise<{ body: string } | { error: Response }>}
 */
async function readBoundedRpcBody(request, maxBodyBytes) {
	const contentLength = request.headers.get('content-length');
	if (contentLength !== null) {
		if (!/^\d+$/.test(contentLength)) {
			return { error: rpcError(400, 'Invalid RPC request') };
		}
		const declaredLength = Number(contentLength);
		if (!Number.isSafeInteger(declaredLength) || declaredLength > maxBodyBytes) {
			return { error: rpcError(413, 'RPC request exceeds the maximum body size') };
		}
	}

	if (request.body === null || request.signal.aborted) {
		return { error: rpcError(400, 'Invalid RPC request') };
	}

	const reader = request.body.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let bytesRead = 0;
	let body = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytesRead += value.byteLength;
			if (bytesRead > maxBodyBytes) {
				try {
					await reader.cancel();
				} catch {
					// A hostile stream cannot downgrade an oversized request into another status.
				}
				return { error: rpcError(413, 'RPC request exceeds the maximum body size') };
			}
			body += decoder.decode(value, { stream: true });
		}
		body += decoder.decode();
	} catch {
		return { error: rpcError(400, 'Invalid RPC request') };
	} finally {
		reader.releaseLock();
	}

	try {
		if (!Array.isArray(JSON.parse(body))) {
			return { error: rpcError(400, 'Invalid server function arguments') };
		}
	} catch {
		return { error: rpcError(400, 'Invalid server function arguments') };
	}

	return { body };
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isInvalidRpcPayload(error) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'OCTANE_INVALID_RPC_PAYLOAD'
	);
}

/**
 * Validate and execute an Octane server function behind application middleware.
 *
 * @param {Request} request
 * @param {import('@octanejs/app-core').RpcRequestOptions} options
 * @returns {Promise<Response>}
 */
export async function handleRpcRequest(request, options) {
	if (request.method === 'OPTIONS') {
		const origin = allowedRequestOrigin(
			request,
			options.trustProxy ?? false,
			options.allowedOrigins ?? [],
		);
		const browserOrigin = request.headers.get('origin');
		if (origin === null || browserOrigin === null || browserOrigin === origin) {
			return rpcError(403, 'Cross-origin RPC requests are not allowed');
		}
		if (request.headers.get('access-control-request-method') !== 'POST') {
			return rpcError(405, 'RPC requests require POST', { Allow: 'POST' });
		}

		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': browserOrigin,
				'Access-Control-Allow-Methods': 'POST',
				'Access-Control-Allow-Headers':
					request.headers.get('access-control-request-headers') ?? 'content-type',
				Vary: 'Origin, Access-Control-Request-Headers',
			},
		});
	}

	if (request.method !== 'POST') {
		return rpcError(405, 'RPC requests require POST', { Allow: 'POST' });
	}

	const contentType = request.headers.get('content-type');
	if (contentType === null || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
		return rpcError(415, 'RPC requests require application/json');
	}

	const hash = new URL(request.url).pathname.slice(RPC_PATH_PREFIX.length);
	if (!/^[a-f0-9]{8}$/.test(hash)) {
		return rpcError(400, 'Invalid RPC request');
	}

	const origin = allowedRequestOrigin(
		request,
		options.trustProxy ?? false,
		options.allowedOrigins ?? [],
	);
	if (origin === null) {
		return rpcError(403, 'Cross-origin RPC requests are not allowed');
	}
	const browserOrigin = request.headers.get('origin');
	const corsOrigin = browserOrigin === origin ? null : browserOrigin;

	const context = createContext(request, {}, options.platform);
	const store =
		options.platform === undefined ? { origin } : { origin, platform: options.platform };

	try {
		const response = await options.asyncContext.run(store, async () =>
			runMiddlewareChain(
				context,
				options.middlewares ?? [],
				[],
				async () => {
					const fn = await options.resolveFunction(hash);
					if (fn === null) return rpcError(404, 'RPC function not found');
					const payload = await readBoundedRpcBody(
						request,
						options.maxBodyBytes ?? DEFAULT_RPC_MAX_BODY_BYTES,
					);
					if ('error' in payload) return payload.error;
					try {
						const result = await options.executeServerFunction(fn, payload.body);
						return new Response(result, {
							status: 200,
							headers: { 'Content-Type': 'application/json; charset=utf-8' },
						});
					} catch (error) {
						if (isInvalidRpcPayload(error)) {
							return rpcError(400, 'Invalid server function arguments');
						}
						throw error;
					}
				},
				[],
			),
		);
		return withRpcCors(response, corsOrigin);
	} catch (error) {
		console.error('[octane] RPC request error:', error);
		return withRpcCors(rpcError(500, 'Internal Server Error'), corsOrigin);
	}
}
