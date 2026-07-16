// @ts-check
/**
 * Node HTTP glue — shared by the dev middleware (src/index.js), the generated
 * production server entry (its `nodeHandler` export for serverless wrappers),
 * and the built-in production server (`createNodeServer`, the no-adapter
 * default boot). Exported as '@octanejs/app-core/node'.
 *
 * This module may import node builtins (unlike server/production.js, which is
 * platform-agnostic) — it IS the Node platform layer.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Duplex, pipeline, Readable } from 'node:stream';
import { constants as zlibConstants, createGzip } from 'node:zlib';

const MIN_COMPRESSION_BYTES = 1024;

/**
 * Read one request header in the comma-joined form HTTP negotiation expects.
 * @param {import('node:http').IncomingMessage} request
 * @param {string} name
 * @returns {string | null}
 */
function getRequestHeader(request, name) {
	const value = request.headers[name];
	if (value === undefined) return null;
	return Array.isArray(value) ? value.join(',') : value;
}

/**
 * Return the client's quality for one content coding. An explicit coding wins
 * over `*`, including an explicit `q=0` exclusion.
 * @param {string | null} header
 * @param {string} coding
 */
function encodingQuality(header, coding) {
	if (header === null || header.trim() === '') return 0;
	/** @type {number | null} */
	let exact = null;
	/** @type {number | null} */
	let wildcard = null;
	for (const entry of header.split(',')) {
		const [rawToken, ...parameters] = entry.split(';');
		const token = rawToken.trim().toLowerCase();
		if (token !== coding && token !== '*') continue;

		let quality = 1;
		for (const parameter of parameters) {
			const match = /^\s*q\s*=\s*([^\s]+)\s*$/i.exec(parameter);
			if (!match) continue;
			// RFC 9110 qvalues are 0..1 with at most three fractional digits.
			quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(match[1]) ? Number(match[1]) : 0;
		}

		if (token === coding && exact === null) exact = quality;
		if (token === '*' && wildcard === null) wildcard = quality;
	}
	return exact ?? wildcard ?? 0;
}

/** @param {string | null} contentType */
function isCompressibleContentType(contentType) {
	if (!contentType) return false;
	const type = contentType.split(';', 1)[0].trim().toLowerCase();
	if (type === 'text/event-stream') return false;
	if (type.startsWith('text/')) return true;
	if (type === 'image/svg+xml') return true;
	if (type === 'application/wasm') return true;
	if (type === 'font/ttf' || type === 'font/otf') return true;
	if (type.endsWith('+json') || type.endsWith('+xml')) return true;
	return (
		type === 'application/json' ||
		type === 'application/javascript' ||
		type === 'application/x-javascript' ||
		type === 'application/xml' ||
		type === 'application/xhtml+xml' ||
		type === 'application/rss+xml' ||
		type === 'application/atom+xml'
	);
}

/** @param {Headers} headers */
function appendAcceptEncodingVary(headers) {
	const vary = headers.get('Vary');
	if (!vary) {
		headers.set('Vary', 'Accept-Encoding');
		return;
	}
	if (vary.trim() === '*') return;
	if (vary.split(',').some((value) => value.trim().toLowerCase() === 'accept-encoding')) {
		return;
	}
	headers.set('Vary', `${vary}, Accept-Encoding`);
}

/**
 * Decide whether this representation is eligible for negotiated gzip. Eligible
 * identity responses still gain `Vary: Accept-Encoding`, so shared caches do
 * not reuse them for gzip-capable clients.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {number} status
 * @param {Headers} headers
 * @param {boolean} hasBody
 */
function shouldGzip(request, status, headers, hasBody) {
	const method = (request.method || 'GET').toUpperCase();
	if (!hasBody || method === 'HEAD') return false;
	if (status < 200 || status === 204 || status === 205 || status === 206 || status === 304) {
		return false;
	}
	if (getRequestHeader(request, 'range') !== null || headers.has('Content-Range')) return false;
	if (headers.has('Content-Encoding')) return false;
	if (/(?:^|,)\s*no-transform\s*(?:,|$)/i.test(headers.get('Cache-Control') || '')) {
		return false;
	}
	if (!isCompressibleContentType(headers.get('Content-Type'))) return false;

	const rawLength = headers.get('Content-Length');
	if (rawLength !== null) {
		const length = Number(rawLength);
		if (Number.isFinite(length) && length < MIN_COMPRESSION_BYTES) return false;
	}

	appendAcceptEncodingVary(headers);
	return encodingQuality(getRequestHeader(request, 'accept-encoding'), 'gzip') > 0;
}

/**
 * Convert a Node.js IncomingMessage to a Web Request.
 * @param {import('node:http').IncomingMessage} nodeRequest
 * @returns {Request}
 */
export function nodeRequestToWebRequest(nodeRequest) {
	const host = nodeRequest.headers.host || 'localhost';
	const url = new URL(nodeRequest.url || '/', `http://${host}`);

	const headers = new Headers();
	for (const [key, value] of Object.entries(nodeRequest.headers)) {
		if (value == null) continue;
		if (Array.isArray(value)) {
			for (const v of value) headers.append(key, v);
		} else {
			headers.set(key, value);
		}
	}

	const method = (nodeRequest.method || 'GET').toUpperCase();
	/** @type {RequestInit & { duplex?: 'half' }} */
	const init = { method, headers };
	const abortController = new AbortController();
	const abortRequest = () => {
		if (!abortController.signal.aborted) {
			abortController.abort(new Error('The client disconnected before the request completed.'));
		}
	};
	if (nodeRequest.aborted || (nodeRequest.destroyed && !nodeRequest.complete)) {
		abortRequest();
	} else {
		nodeRequest.once('aborted', abortRequest);
		nodeRequest.once('close', () => {
			if (!nodeRequest.complete) abortRequest();
		});
	}
	init.signal = abortController.signal;
	if (method !== 'GET' && method !== 'HEAD') {
		// node:stream/web's ReadableStream and the DOM lib's are structurally the
		// same at runtime; the lib types disagree on BYOB details.
		init.body = /** @type {ReadableStream} */ (
			/** @type {unknown} */ (Readable.toWeb(nodeRequest))
		);
		init.duplex = 'half';
	}
	return new Request(url, init);
}

/**
 * Pipe a Web Response to a Node.js ServerResponse. Streams chunk-by-chunk so a
 * streaming SSR body flushes as it renders (no buffering).
 *
 * @param {import('node:http').ServerResponse} nodeResponse
 * @param {Response} webResponse
 */
export async function sendWebResponse(nodeResponse, webResponse) {
	return sendWebResponseForRequest(nodeResponse, webResponse);
}

/**
 * The built-in server supplies the request so this transport layer can
 * negotiate compression. Serverless adapters keep calling `sendWebResponse`
 * without transport compression because their host owns content encoding.
 *
 * @param {import('node:http').ServerResponse} nodeResponse
 * @param {Response} webResponse
 * @param {import('node:http').IncomingMessage} [nodeRequest]
 */
async function sendWebResponseForRequest(nodeResponse, webResponse, nodeRequest) {
	const headers = new Headers(webResponse.headers);
	/** @type {ReadableStream<Uint8Array> | null} */
	let body = webResponse.body;
	if (nodeRequest && body && shouldGzip(nodeRequest, webResponse.status, headers, true)) {
		headers.set('Content-Encoding', 'gzip');
		headers.delete('Content-Length');
		// Sync-flush each input chunk so an SSR shell stays progressively
		// observable instead of waiting for the final segment to close gzip.
		const gzip = Duplex.toWeb(createGzip({ flush: zlibConstants.Z_SYNC_FLUSH }));
		body = body.pipeThrough(
			/** @type {ReadableWritablePair<Uint8Array, Uint8Array>} */ (/** @type {unknown} */ (gzip)),
		);
	}

	nodeResponse.statusCode = webResponse.status;
	if (webResponse.statusText) nodeResponse.statusMessage = webResponse.statusText;
	headers.forEach((value, key) => {
		nodeResponse.setHeader(key, value);
	});
	if (body) {
		const reader = body.getReader();
		let disconnected = nodeResponse.destroyed;
		let disconnectReason = new Error('The client disconnected while streaming the response.');
		/** @type {Promise<void> | null} */
		let cancelPromise = null;
		const cancelReader = (/** @type {unknown} */ reason) => {
			disconnectReason = reason instanceof Error ? reason : disconnectReason;
			return (cancelPromise ??= reader.cancel(reason).catch(() => {}));
		};
		const onClose = () => {
			if (nodeResponse.writableEnded) return;
			disconnected = true;
			void cancelReader(disconnectReason);
		};
		const onError = (/** @type {Error} */ error) => {
			disconnected = true;
			void cancelReader(error);
		};
		nodeResponse.once('close', onClose);
		nodeResponse.once('error', onError);
		try {
			if (disconnected) await cancelReader(disconnectReason);
			while (!disconnected) {
				const { done, value } = await reader.read();
				if (done) break;
				const accepted = nodeResponse.write(value);
				if (!accepted && !disconnected) await waitForDrain(nodeResponse);
			}
		} catch (error) {
			if (!disconnected) throw error;
		} finally {
			nodeResponse.off('close', onClose);
			nodeResponse.off('error', onError);
			if (disconnected) await cancelReader(disconnectReason);
			reader.releaseLock();
		}
	}
	if (!nodeResponse.destroyed) nodeResponse.end();
}

/**
 * Pause source reads until Node's writable buffer drains. A disconnect/error
 * rejects the wait; sendWebResponse's socket listeners cancel the web reader.
 * @param {import('node:http').ServerResponse} response
 */
function waitForDrain(response) {
	if (response.destroyed) {
		return Promise.reject(new Error('The client disconnected while waiting for drain.'));
	}
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			response.off('drain', onDrain);
			response.off('close', onClose);
			response.off('error', onError);
		};
		const onDrain = () => {
			cleanup();
			resolve(undefined);
		};
		const onClose = () => {
			cleanup();
			reject(new Error('The client disconnected while waiting for drain.'));
		};
		const onError = (/** @type {Error} */ error) => {
			cleanup();
			reject(error);
		};
		response.once('drain', onDrain);
		response.once('close', onClose);
		response.once('error', onError);
	});
}

// Static-file MIME map (the common web set; anything else falls back to
// octet-stream, which is correct for downloads).
/** @type {Record<string, string>} */
const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.txt': 'text/plain; charset=utf-8',
	'.xml': 'application/xml',
	'.wasm': 'application/wasm',
	'.map': 'application/json',
};

/**
 * Serve a static file from `staticDir` if the request path maps to one.
 * Hash-named build assets (Vite's /assets/ and Rsbuild's /static/) get
 * immutable caching; other files (favicon, robots.txt, …) revalidate.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} staticDir
 * @returns {boolean} true when the request was handled as a static file
 */
export function serveStaticFile(req, res, staticDir) {
	const method = (req.method || 'GET').toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') return false;

	const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
	// Resolve inside staticDir only — a `..` escape must not leave the client dir.
	const filePath = path.normalize(path.join(staticDir, pathname));
	if (!filePath.startsWith(path.normalize(staticDir + path.sep))) return false;

	/** @type {fs.Stats} */
	let stat;
	try {
		stat = fs.statSync(filePath);
	} catch {
		return false;
	}
	if (!stat.isFile()) return false;

	const ext = path.extname(filePath).toLowerCase();
	const headers = new Headers({
		'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
		'Content-Length': String(stat.size),
		'Cache-Control':
			pathname.startsWith('/assets/') || pathname.startsWith('/static/')
				? 'public, max-age=31536000, immutable'
				: 'public, max-age=0, must-revalidate',
	});
	const gzip = shouldGzip(req, 200, headers, method !== 'HEAD');
	if (gzip) {
		headers.set('Content-Encoding', 'gzip');
		headers.delete('Content-Length');
	}

	res.statusCode = 200;
	res.setHeader('Content-Type', /** @type {string} */ (headers.get('Content-Type')));
	const contentLength = headers.get('Content-Length');
	if (contentLength !== null) res.setHeader('Content-Length', contentLength);
	res.setHeader('Cache-Control', /** @type {string} */ (headers.get('Cache-Control')));
	const contentEncoding = headers.get('Content-Encoding');
	if (contentEncoding !== null) res.setHeader('Content-Encoding', contentEncoding);
	const vary = headers.get('Vary');
	if (vary !== null) res.setHeader('Vary', vary);
	if (method === 'HEAD') {
		res.end();
	} else if (gzip) {
		pipeline(fs.createReadStream(filePath), createGzip(), res, (error) => {
			if (error && !res.destroyed) res.destroy(error);
		});
	} else {
		fs.createReadStream(filePath).pipe(res);
	}
	return true;
}

/**
 * Minimal production HTTP server: static files from `staticDir` first (built
 * client assets), then the fetch-style SSR handler. This is the DEFAULT boot
 * when octane.config.ts has no adapter — an adapter's `serve()` replaces it.
 *
 * @param {(request: Request) => Response | Promise<Response>} handler
 * @param {{ staticDir?: string }} [options]
 * @returns {{ listen: (port?: number) => import('node:http').Server, close: () => void }}
 */
export function createNodeServer(handler, options = {}) {
	const staticDir = options.staticDir;

	const server = http.createServer((req, res) => {
		(async () => {
			if (staticDir && serveStaticFile(req, res, staticDir)) return;
			const response = await handler(nodeRequestToWebRequest(req));
			await sendWebResponseForRequest(res, response, req);
		})().catch((error) => {
			console.error('[octane] Request error:', error);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.setHeader('Content-Type', 'text/plain; charset=utf-8');
			}
			res.end('Internal Server Error');
		});
	});

	return {
		listen(port = 3000) {
			return server.listen(port);
		},
		close() {
			server.close();
		},
	};
}
