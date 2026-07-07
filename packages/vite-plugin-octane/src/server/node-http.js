/**
 * Node HTTP glue — shared by the dev middleware (src/index.js), the generated
 * production server entry (its `nodeHandler` export for serverless wrappers),
 * and the built-in production server (`createNodeServer`, the no-adapter
 * default boot). Exported as '@octanejs/vite-plugin/node'.
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
	if (method !== 'GET' && method !== 'HEAD') {
		init.body = Readable.toWeb(nodeRequest);
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
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				nodeResponse.write(value);
			}
		} finally {
			reader.releaseLock();
		}
	}
	nodeResponse.end();
}

// Static-file MIME map (the common web set; anything else falls back to
// octet-stream, which is correct for downloads).
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
 * Hash-named build assets (everything under /assets/) get immutable caching;
 * other files (favicon, robots.txt, …) revalidate.
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
		pathname.startsWith('/assets/')
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
			console.error('[@octanejs/vite-plugin] Request error:', error);
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
