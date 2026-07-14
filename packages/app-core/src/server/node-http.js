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
import { Readable } from 'node:stream';

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
	nodeResponse.statusCode = webResponse.status;
	if (webResponse.statusText) nodeResponse.statusMessage = webResponse.statusText;
	webResponse.headers.forEach((value, key) => {
		nodeResponse.setHeader(key, value);
	});
	if (webResponse.body) {
		const reader = webResponse.body.getReader();
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
	res.statusCode = 200;
	res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
	res.setHeader('Content-Length', stat.size);
	res.setHeader(
		'Cache-Control',
		pathname.startsWith('/assets/') || pathname.startsWith('/static/')
			? 'public, max-age=31536000, immutable'
			: 'public, max-age=0, must-revalidate',
	);
	if (method === 'HEAD') {
		res.end();
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
			await sendWebResponse(res, response);
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
