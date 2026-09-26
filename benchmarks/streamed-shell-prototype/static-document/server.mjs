import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { tree } from './evidence.mjs';

// Local transport for the real emitted Vercel fetch wrapper and static output.
// The page body remains a stream, including cancellation when a browser leaves.
export async function start(report) {
	const errors = [];
	let disconnected = 0;
	const output = path.join(report.project, '.vercel/output');
	const func = path.join(output, 'functions/index.func');
	const originalFunc = path.join(report.output, 'original-function');
	const staticDir = path.join(output, 'static');
	if (!isDeepStrictEqual(tree(originalFunc, new Set()), report.originalFunctionFiles))
		throw new Error('Original function copy changed');
	const ordinary = (await import(pathToFileURL(path.join(originalFunc, 'index.js')).href)).default;
	const candidate = isDeepStrictEqual(tree(output, new Set()), report.vercelFiles)
		? (await import(pathToFileURL(path.join(func, 'index.js')).href)).default
		: null;
	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
			const asset = url.pathname.slice(1);
			if (report.assets[asset]) {
				const bytes = fs.readFileSync(path.join(staticDir, asset));
				const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
				const body = gzip ? gzipSync(bytes, { level: 9 }) : bytes;
				res.writeHead(200, {
					'content-type': asset.endsWith('.js')
						? 'text/javascript; charset=utf-8'
						: asset.endsWith('.svg')
							? 'image/svg+xml'
							: 'text/plain; charset=utf-8',
					'content-length': body.length,
					'cache-control': 'no-store',
					...(gzip ? { 'content-encoding': 'gzip' } : {}),
				});
				res.end(body);
				return;
			}
			const controller = new AbortController();
			req.on('aborted', () => controller.abort());
			res.on('close', () => {
				if (!res.writableEnded) {
					disconnected++;
					controller.abort();
				}
			});
			const request = new Request(url, {
				method: req.method,
				headers: req.headers,
				signal: controller.signal,
			});
			const valid =
				candidate !== null && isDeepStrictEqual(tree(output, new Set()), report.vercelFiles);
			if (!valid && !isDeepStrictEqual(tree(originalFunc, new Set()), report.originalFunctionFiles))
				throw new Error('Original function copy changed');
			const response = await (valid ? candidate : ordinary).fetch(request);
			const headers = Object.fromEntries(response.headers);
			if (!valid && url.pathname === '/') headers['x-static-document-lab'] = 'artifact-fallback';
			res.writeHead(response.status, headers);
			if (!response.body) return res.end();
			const stream = Readable.fromWeb(response.body);
			stream.on('error', (error) => {
				if (!controller.signal.aborted) {
					errors.push(String(error));
					res.destroy(error);
				}
			});
			res.on('close', () => {
				if (!res.writableEnded) stream.destroy();
			});
			stream.pipe(res);
		} catch (error) {
			errors.push(String(error));
			if (!res.headersSent) res.writeHead(500);
			res.end('Benchmark transport error');
		}
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return {
		server,
		origin: `http://127.0.0.1:${server.address().port}`,
		diagnostics: () => ({ errors, disconnected }),
	};
}
