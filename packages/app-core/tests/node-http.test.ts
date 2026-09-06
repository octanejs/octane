import {
	mkdtempSync,
	mkdirSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createGunzip, gunzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeServer, serveStaticFile } from '../src/server/node-http.js';

describe('serveStaticFile cache policy', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-static-cache-'));
		for (const directory of ['assets', 'static']) {
			mkdirSync(join(root, directory), { recursive: true });
			writeFileSync(join(root, directory, 'app-123.js'), 'export {};\n');
		}
		writeFileSync(join(root, 'robots.txt'), 'User-agent: *\n');
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function cacheControl(pathname: string) {
		const headers = new Map<string, unknown>();
		const response = {
			statusCode: 0,
			setHeader: vi.fn((name: string, value: unknown) => headers.set(name, value)),
			end: vi.fn(),
		};
		expect(serveStaticFile({ method: 'HEAD', url: pathname } as any, response as any, root)).toBe(
			true,
		);
		return headers.get('Cache-Control');
	}

	it('marks Vite and Rsbuild hashed asset directories immutable', () => {
		expect(cacheControl('/assets/app-123.js')).toBe('public, max-age=31536000, immutable');
		expect(cacheControl('/static/app-123.js')).toBe('public, max-age=31536000, immutable');
	});

	it('keeps root public files revalidatable', () => {
		expect(cacheControl('/robots.txt')).toBe('public, max-age=0, must-revalidate');
	});
});

describe('built-in Node static file containment', () => {
	let temporaryRoot: string;
	let staticRoot: string;
	let privateRoot: string;
	let secretPath: string;
	let origin: string;
	let transport: ReturnType<typeof createNodeServer>;
	let listener: import('node:http').Server;

	beforeAll(async () => {
		temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-static-containment-'));
		staticRoot = join(temporaryRoot, 'public');
		privateRoot = join(temporaryRoot, 'private');
		mkdirSync(join(staticRoot, 'assets'), { recursive: true });
		mkdirSync(join(privateRoot, 'nested'), { recursive: true });
		writeFileSync(join(staticRoot, 'assets', 'safe.txt'), 'public-asset');
		secretPath = join(privateRoot, 'secret.txt');
		writeFileSync(secretPath, 'private-data');
		writeFileSync(join(privateRoot, 'nested', 'secret.txt'), 'nested-secret');
		symlinkSync(secretPath, join(staticRoot, 'assets', 'file-link.txt'));
		symlinkSync(privateRoot, join(staticRoot, 'directory-link'), 'dir');
		symlinkSync(join(staticRoot, 'assets', 'safe.txt'), join(staticRoot, 'inside-link.txt'));

		transport = createNodeServer(() => new Response('Not Found', { status: 404 }), {
			staticDir: staticRoot,
		});
		listener = transport.listen(0);
		await once(listener, 'listening');
		const address = listener.address();
		if (!address || typeof address === 'string') throw new Error('Node test server has no port');
		origin = `http://127.0.0.1:${address.port}`;
	});

	afterAll(async () => {
		const closed = once(listener, 'close');
		transport.close();
		await closed;
		rmSync(temporaryRoot, { recursive: true, force: true });
	});

	it.each(['/assets/file-link.txt', '/directory-link/nested/secret.txt'])(
		'keeps an outside symlink target private at %s',
		async (pathname) => {
			for (const method of ['GET', 'HEAD']) {
				const response = await fetch(origin + pathname, { method });
				expect(response.status).toBe(404);
				expect(await response.text()).toBe(method === 'HEAD' ? '' : 'Not Found');
			}
		},
	);

	it('still serves direct files and symlinks whose targets remain inside the static root', async () => {
		for (const pathname of ['/assets/safe.txt', '/inside-link.txt']) {
			const response = await fetch(origin + pathname);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('public-asset');
		}
	});

	it('does not follow a configured static root symlink retargeted after server startup', async () => {
		const linkedRoot = join(temporaryRoot, 'configured-root');
		symlinkSync(staticRoot, linkedRoot, 'dir');
		const linkedTransport = createNodeServer(() => new Response('Not Found', { status: 404 }), {
			staticDir: linkedRoot,
		});
		const linkedListener = linkedTransport.listen(0);
		try {
			await once(linkedListener, 'listening');
			const address = linkedListener.address();
			if (!address || typeof address === 'string') throw new Error('Node test server has no port');
			const linkedOrigin = `http://127.0.0.1:${address.port}`;
			const before = await fetch(linkedOrigin + '/assets/safe.txt', {
				headers: { Connection: 'close' },
			});
			expect(before.status).toBe(200);
			expect(await before.text()).toBe('public-asset');

			unlinkSync(linkedRoot);
			symlinkSync(privateRoot, linkedRoot, 'dir');
			const after = await fetch(linkedOrigin + '/secret.txt', {
				headers: { Connection: 'close' },
			});
			expect(after.status).toBe(404);
			expect(await after.text()).toBe('Not Found');
		} finally {
			const closed = once(linkedListener, 'close');
			linkedTransport.close();
			await closed;
		}
	});

	it('does not serve a static root first created as an outside symlink after startup', async () => {
		const missingRoot = join(temporaryRoot, 'missing-at-startup');
		const lateTransport = createNodeServer(() => new Response('Not Found', { status: 404 }), {
			staticDir: missingRoot,
		});
		const lateListener = lateTransport.listen(0);
		try {
			await once(lateListener, 'listening');
			symlinkSync(privateRoot, missingRoot, 'dir');
			const address = lateListener.address();
			if (!address || typeof address === 'string') throw new Error('Node test server has no port');
			const response = await fetch(`http://127.0.0.1:${address.port}/secret.txt`, {
				headers: { Connection: 'close' },
			});
			expect(response.status).toBe(404);
			expect(await response.text()).toBe('Not Found');
		} finally {
			const closed = once(lateListener, 'close');
			lateTransport.close();
			await closed;
		}
	});

	it('streams the verified file when its path is replaced before asynchronous reading', async () => {
		const publicPath = join(staticRoot, 'race.txt');
		writeFileSync(publicPath, 'public-asset');
		const server = createServer((req, res) => {
			if (!serveStaticFile(req, res, staticRoot)) {
				res.statusCode = 404;
				res.end('Not Found');
				return;
			}
			renameSync(publicPath, join(staticRoot, 'race-original.txt'));
			symlinkSync(secretPath, publicPath);
		});
		server.listen(0);
		await once(server, 'listening');
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Node test server has no port');
			const response = await fetch(`http://127.0.0.1:${address.port}/race.txt`, {
				headers: { Connection: 'close' },
			});
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('public-asset');
		} finally {
			const closed = once(server, 'close');
			server.close();
			await closed;
		}
	});
});

describe('built-in Node server response compression', () => {
	const html = `<main>${'Octane streaming HTML. '.repeat(160)}</main>`;
	const staticJavaScript = `export const value = ${JSON.stringify('compressible '.repeat(180))};\n`;
	let root: string;
	let origin: string;
	let transport: ReturnType<typeof createNodeServer>;
	let listener: import('node:http').Server;
	let segmentGate: PromiseWithResolvers<void> | null = null;

	beforeAll(async () => {
		root = mkdtempSync(join(tmpdir(), 'octane-node-compression-'));
		mkdirSync(join(root, 'assets'), { recursive: true });
		writeFileSync(join(root, 'assets/app-123.js'), staticJavaScript);

		transport = createNodeServer(
			(request) => {
				const pathname = new URL(request.url).pathname;
				if (pathname === '/stream') {
					if (!segmentGate) throw new Error('stream gate was not initialized');
					const gate = segmentGate;
					const encoder = new TextEncoder();
					return new Response(
						new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(encoder.encode('shell'));
								void gate.promise.then(() => {
									controller.enqueue(encoder.encode('segment'));
									controller.close();
								});
							},
						}),
						{ headers: { 'Content-Type': 'text/html; charset=utf-8' } },
					);
				}
				if (pathname === '/small') {
					const body = 'small response';
					return new Response(body, {
						headers: {
							'Content-Type': 'text/plain; charset=utf-8',
							'Content-Length': String(Buffer.byteLength(body)),
						},
					});
				}
				if (pathname === '/image') {
					const body = new Uint8Array(2048);
					return new Response(body, {
						headers: {
							'Content-Type': 'image/png',
							'Content-Length': String(body.byteLength),
						},
					});
				}
				if (pathname === '/encoded') {
					return new Response('pre-encoded representation', {
						headers: {
							'Content-Type': 'text/plain; charset=utf-8',
							'Content-Encoding': 'br',
						},
					});
				}
				if (pathname === '/no-transform') {
					return new Response(html, {
						headers: {
							'Content-Type': 'text/html; charset=utf-8',
							'Cache-Control': 'public, no-transform, max-age=60',
						},
					});
				}
				if (pathname === '/partial') {
					return new Response(html.slice(0, 128), {
						status: 206,
						headers: {
							'Content-Type': 'text/html; charset=utf-8',
							'Content-Range': `bytes 0-127/${Buffer.byteLength(html)}`,
						},
					});
				}
				return new Response(html, {
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
						Vary:
							pathname === '/vary-star'
								? '*'
								: pathname === '/vary-existing'
									? 'Origin, accept-encoding'
									: 'Origin',
					},
				});
			},
			{ staticDir: root },
		);
		listener = transport.listen(0);
		await once(listener, 'listening');
		const address = listener.address();
		if (!address || typeof address === 'string') throw new Error('Node test server has no port');
		origin = `http://127.0.0.1:${address.port}`;
	});

	afterAll(async () => {
		const closed = once(listener, 'close');
		transport.close();
		await closed;
		rmSync(root, { recursive: true, force: true });
	});

	function get(
		pathname: string,
		options: { method?: string; headers?: Record<string, string> } = {},
	) {
		return new Promise<{
			status: number;
			headers: import('node:http').IncomingHttpHeaders;
			body: Buffer;
		}>((resolve, reject) => {
			const outgoing = request(
				origin + pathname,
				{
					method: options.method ?? 'GET',
					headers: { Connection: 'close', ...options.headers },
				},
				(response) => {
					const chunks: Buffer[] = [];
					response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
					response.on('end', () => {
						resolve({
							status: response.statusCode ?? 0,
							headers: response.headers,
							body: Buffer.concat(chunks),
						});
					});
				},
			);
			outgoing.on('error', reject);
			outgoing.end();
		});
	}

	it('gzip-streams SSR and static text without buffering their original length', async () => {
		const rendered = await get('/', { headers: { 'Accept-Encoding': 'gzip' } });
		expect(rendered.status).toBe(200);
		expect(rendered.headers['content-encoding']).toBe('gzip');
		expect(rendered.headers['content-length']).toBeUndefined();
		expect(rendered.headers.vary).toBe('Origin, Accept-Encoding');
		expect(gunzipSync(rendered.body).toString()).toBe(html);

		const asset = await get('/assets/app-123.js', {
			headers: { 'Accept-Encoding': 'gzip' },
		});
		expect(asset.status).toBe(200);
		expect(asset.headers['content-encoding']).toBe('gzip');
		expect(asset.headers['content-length']).toBeUndefined();
		expect(asset.headers.vary).toBe('Accept-Encoding');
		expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
		expect(gunzipSync(asset.body).toString()).toBe(staticJavaScript);
	});

	it('flushes each compressed SSR wave before a later segment resolves', async () => {
		segmentGate = Promise.withResolvers<void>();
		const shellObserved = Promise.withResolvers<void>();
		const responseHeaders = Promise.withResolvers<import('node:http').IncomingHttpHeaders>();
		let output = '';
		const completed = new Promise<string>((resolve, reject) => {
			const outgoing = request(
				origin + '/stream',
				{ headers: { Connection: 'close', 'Accept-Encoding': 'gzip' } },
				(response) => {
					responseHeaders.resolve(response.headers);
					const gunzip = createGunzip();
					gunzip.on('data', (chunk) => {
						output += chunk.toString();
						if (output.includes('shell')) shellObserved.resolve();
					});
					gunzip.on('end', () => resolve(output));
					gunzip.on('error', reject);
					response.pipe(gunzip);
				},
			);
			outgoing.on('error', reject);
			outgoing.end();
		});

		const timeout = setTimeout(
			() => shellObserved.reject(new Error('compressed shell did not flush')),
			1000,
		);
		try {
			await shellObserved.promise;
			expect((await responseHeaders.promise)['content-encoding']).toBe('gzip');
			expect(output).toBe('shell');
		} finally {
			clearTimeout(timeout);
			segmentGate.resolve();
		}
		expect(await completed).toBe('shellsegment');
		segmentGate = null;
	});

	it('honors qvalues and keeps cache variants distinct for identity responses', async () => {
		const excluded = await get('/', {
			headers: { 'Accept-Encoding': 'gzip;q=0, *;q=1' },
		});
		expect(excluded.headers['content-encoding']).toBeUndefined();
		expect(excluded.headers.vary).toBe('Origin, Accept-Encoding');
		expect(excluded.body.toString()).toBe(html);

		const wildcard = await get('/', { headers: { 'Accept-Encoding': '*;q=0.5' } });
		expect(wildcard.headers['content-encoding']).toBe('gzip');
		expect(gunzipSync(wildcard.body).toString()).toBe(html);

		const varyStar = await get('/vary-star', {
			headers: { 'Accept-Encoding': 'gzip' },
		});
		expect(varyStar.headers['content-encoding']).toBe('gzip');
		expect(varyStar.headers.vary).toBe('*');

		const varyExisting = await get('/vary-existing', {
			headers: { 'Accept-Encoding': 'gzip' },
		});
		expect(varyExisting.headers['content-encoding']).toBe('gzip');
		expect(varyExisting.headers.vary).toBe('Origin, accept-encoding');
	});

	it('leaves small, noncompressible, transformed, partial, range, and HEAD responses intact', async () => {
		for (const pathname of ['/small', '/image', '/encoded', '/no-transform', '/partial']) {
			const response = await get(pathname, { headers: { 'Accept-Encoding': 'gzip' } });
			expect(response.headers['content-encoding']).toBe(pathname === '/encoded' ? 'br' : undefined);
			expect(response.headers.vary).toBeUndefined();
		}

		const ranged = await get('/assets/app-123.js', {
			headers: { 'Accept-Encoding': 'gzip', Range: 'bytes=0-99' },
		});
		expect(ranged.status).toBe(200);
		expect(ranged.headers['content-encoding']).toBeUndefined();
		expect(ranged.headers['content-length']).toBe(String(Buffer.byteLength(staticJavaScript)));
		expect(ranged.body.toString()).toBe(staticJavaScript);

		const head = await get('/assets/app-123.js', {
			method: 'HEAD',
			headers: { 'Accept-Encoding': 'gzip' },
		});
		expect(head.headers['content-encoding']).toBeUndefined();
		expect(head.headers['content-length']).toBe(String(Buffer.byteLength(staticJavaScript)));
		expect(head.body).toHaveLength(0);
	});
});
