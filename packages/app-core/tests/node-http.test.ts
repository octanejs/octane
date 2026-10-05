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
import { EventEmitter, once } from 'node:events';
import { createGunzip, gunzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createNodeServer,
	nodeRequestToWebRequest,
	sendWebResponse,
	serveStaticFile,
} from '../src/server/node-http.js';

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
				if (
					pathname === '/strong-etag' ||
					pathname === '/weak-etag' ||
					pathname === '/no-transform-etag'
				) {
					return new Response(html, {
						headers: {
							'Content-Type': 'text/html; charset=utf-8',
							ETag: pathname === '/weak-etag' ? 'W/"identity-v1"' : '"identity-v1"',
							...(pathname === '/no-transform-etag' ? { 'Cache-Control': 'no-transform' } : {}),
						},
					});
				}
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

	it('does not reuse a strong identity ETag for a gzip representation', async () => {
		const identity = await get('/strong-etag');
		expect(identity.headers.etag).toBe('"identity-v1"');
		expect(identity.body.toString()).toBe(html);

		const compressed = await get('/strong-etag', {
			headers: { 'Accept-Encoding': 'gzip' },
		});
		expect(compressed.headers['content-encoding']).toBe('gzip');
		expect(gunzipSync(compressed.body).toString()).toBe(html);
		expect(compressed.headers.etag).toBeUndefined();

		const weak = await get('/weak-etag', { headers: { 'Accept-Encoding': 'gzip' } });
		expect(weak.headers['content-encoding']).toBe('gzip');
		expect(weak.headers.etag).toBe('W/"identity-v1"');

		const noTransform = await get('/no-transform-etag', {
			headers: { 'Accept-Encoding': 'gzip' },
		});
		expect(noTransform.headers['content-encoding']).toBeUndefined();
		expect(noTransform.headers.etag).toBe('"identity-v1"');

		const head = await get('/strong-etag', {
			method: 'HEAD',
			headers: { 'Accept-Encoding': 'gzip' },
		});
		expect(head.headers['content-encoding']).toBeUndefined();
		expect(head.headers.etag).toBe('"identity-v1"');
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

describe('built-in Node server response headers', () => {
	const sessionCookie =
		'session=session-value; Path=/; HttpOnly; Expires=Wed, 21 Oct 2037 07:28:00 GMT';
	const csrfCookie = 'csrf=csrf-value; Path=/; SameSite=Lax';
	const servers: { close(): void; listener: import('node:http').Server }[] = [];

	function cookieResponse(pathname: string) {
		const headers = new Headers({ 'Content-Type': 'text/plain; charset=utf-8' });
		if (pathname !== '/none') headers.append('Set-Cookie', sessionCookie);
		if (pathname === '/multiple') headers.append('Set-Cookie', csrfCookie);
		headers.append('X-Multi', 'first');
		headers.append('X-Multi', 'second');
		headers.set('Cache-Control', 'private, max-age=0');
		return new Response('ok', { headers });
	}

	async function track(
		listener: import('node:http').Server,
		close: () => void = () => listener.close(),
	) {
		servers.push({ close, listener });
		if (!listener.listening) await once(listener, 'listening');
		const address = listener.address();
		if (!address || typeof address === 'string') throw new Error('Node test server has no port');
		return `http://127.0.0.1:${address.port}`;
	}

	afterEach(async () => {
		for (const { close, listener } of servers.splice(0)) {
			const closed = once(listener, 'close');
			close();
			await closed;
		}
	});

	function get(url: string) {
		return new Promise<{
			status: number;
			headers: import('node:http').IncomingHttpHeaders;
			rawHeaders: string[];
			body: Buffer;
		}>((resolve, reject) => {
			const outgoing = request(url, { headers: { Connection: 'close' } }, (response) => {
				const chunks: Buffer[] = [];
				response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
				response.on('error', reject);
				response.on('end', () => {
					resolve({
						status: response.statusCode ?? 0,
						headers: response.headers,
						rawHeaders: response.rawHeaders,
						body: Buffer.concat(chunks),
					});
				});
			});
			outgoing.on('error', reject);
			outgoing.end();
		});
	}

	function rawValues(rawHeaders: string[], name: string) {
		const values: string[] = [];
		for (let index = 0; index < rawHeaders.length; index += 2) {
			if (rawHeaders[index].toLowerCase() === name) values.push(rawHeaders[index + 1]);
		}
		return values;
	}

	async function expectCookieHeaders(origin: string) {
		const none = await get(origin + '/none');
		expect(none.status).toBe(200);
		expect(none.headers['set-cookie']).toBeUndefined();

		const single = await get(origin + '/single');
		expect(single.status).toBe(200);
		expect(single.body.toString()).toBe('ok');
		// The comma inside `Expires` belongs to the cookie, not a list separator.
		expect(single.headers['set-cookie']).toEqual([sessionCookie]);
		expect(rawValues(single.rawHeaders, 'set-cookie')).toEqual([sessionCookie]);

		const multiple = await get(origin + '/multiple');
		expect(multiple.status).toBe(200);
		expect(multiple.body.toString()).toBe('ok');
		expect(multiple.headers['set-cookie']).toEqual([sessionCookie, csrfCookie]);
		// Each cookie travels as its own header line, in source order.
		expect(rawValues(multiple.rawHeaders, 'set-cookie')).toEqual([sessionCookie, csrfCookie]);

		// Ordinary headers keep the Fetch combined-value behavior.
		for (const response of [none, single, multiple]) {
			expect(rawValues(response.rawHeaders, 'x-multi')).toEqual(['first, second']);
			expect(response.headers['cache-control']).toBe('private, max-age=0');
			expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
		}
	}

	it('forwards every Set-Cookie value from the built-in server', async () => {
		const transport = createNodeServer((request) => cookieResponse(new URL(request.url).pathname));
		const origin = await track(transport.listen(0), () => transport.close());
		await expectCookieHeaders(origin);
	});

	it('forwards every Set-Cookie value through sendWebResponse', async () => {
		const origin = await track(
			createServer((req, res) => {
				void sendWebResponse(res, cookieResponse(new URL(req.url ?? '/', 'http://x').pathname));
			}).listen(0),
		);
		await expectCookieHeaders(origin);
	});
});

describe('Node request origin behind a proxy', () => {
	const trusted = { trustProxy: true };
	const proxied = {
		host: 'upstream.internal:3000',
		'x-forwarded-proto': 'https',
		'x-forwarded-host': 'app.example.com',
	};

	function requestUrl(
		target: string,
		headers: Record<string, string | string[]>,
		options?: { trustProxy?: boolean },
	) {
		const incoming = Object.assign(new EventEmitter(), {
			headers,
			method: 'GET',
			url: target,
			aborted: false,
			destroyed: false,
			complete: true,
		});
		return nodeRequestToWebRequest(incoming as any, undefined, options).url;
	}

	it('keeps the direct connection origin unless trustProxy is enabled', () => {
		const direct = 'http://upstream.internal:3000/sign-in?next=%2Fhome';
		expect(requestUrl('/sign-in?next=%2Fhome', proxied)).toBe(direct);
		expect(requestUrl('/sign-in?next=%2Fhome', proxied, { trustProxy: false })).toBe(direct);
	});

	it('takes the scheme and host from a trusted proxy', () => {
		expect(requestUrl('/sign-in?next=%2Fhome', proxied, trusted)).toBe(
			'https://app.example.com/sign-in?next=%2Fhome',
		);
		expect(
			requestUrl(
				'/api/auth/sign-in',
				{ host: 'flowdular-test.vercel.app', 'x-forwarded-proto': 'https' },
				trusted,
			),
		).toBe('https://flowdular-test.vercel.app/api/auth/sign-in');
		expect(
			requestUrl(
				'/',
				{ ...proxied, 'x-forwarded-proto': 'HTTPS', 'x-forwarded-host': 'app.example.com:443' },
				trusted,
			),
		).toBe('https://app.example.com/');
		expect(
			requestUrl('/', { ...proxied, 'x-forwarded-host': 'app.example.com:8443' }, trusted),
		).toBe('https://app.example.com:8443/');
		expect(
			requestUrl(
				'/',
				{ host: 'upstream', 'x-forwarded-proto': 'http', 'x-forwarded-host': '[2001:db8::1]:8080' },
				trusted,
			),
		).toBe('http://[2001:db8::1]:8080/');
	});

	it('reads only the first entry of a multi-valued forwarded header', () => {
		expect(
			requestUrl(
				'/',
				{
					host: 'upstream',
					'x-forwarded-proto': 'https, http',
					'x-forwarded-host': ' app.example.com , upstream',
				},
				trusted,
			),
		).toBe('https://app.example.com/');
		expect(
			requestUrl(
				'/',
				{
					host: 'upstream',
					'x-forwarded-proto': ['https', 'http'],
					'x-forwarded-host': ['app.example.com', 'upstream'],
				},
				trusted,
			),
		).toBe('https://app.example.com/');
		expect(
			requestUrl(
				'/',
				{
					host: 'upstream',
					'x-forwarded-proto': ', https',
					'x-forwarded-host': ', app.example.com',
				},
				trusted,
			),
		).toBe('http://upstream/');
	});

	it.each(['ftp', 'https:', 'https://evil.example', 'javascript', ''])(
		'ignores the forwarded scheme %j',
		(proto) => {
			expect(
				requestUrl('/a/b?c=1', { host: 'app.example.com', 'x-forwarded-proto': proto }, trusted),
			).toBe('http://app.example.com/a/b?c=1');
		},
	);

	it.each([
		'evil.example/admin',
		'evil.example?admin=1',
		'evil.example#admin',
		'user@evil.example',
		'evil.example\\admin',
		'evil example',
		'évil.example',
		'evil.example:',
		'evil.example:99999',
		'999.0.0.1',
		'[::::]',
		'[2001:db8::1',
		'',
	])('ignores the forwarded host %j without changing the path', (host) => {
		expect(
			requestUrl(
				'/a/b?c=1',
				{ host: 'app.example.com', 'x-forwarded-proto': 'https', 'x-forwarded-host': host },
				trusted,
			),
		).toBe('https://app.example.com/a/b?c=1');
	});

	it.each(['/', '/a/b?c=1&d=%2F', '/%7Euser/a%20b?q=a+b', '/a/./b/../c', '/a//b', '*'])(
		'keeps the path and query of %j under a trusted proxy',
		(target) => {
			const direct = new URL(requestUrl(target, { host: 'upstream.internal:3000' }));
			const forwarded = new URL(requestUrl(target, proxied, trusted));
			expect(forwarded.origin).toBe('https://app.example.com');
			expect(forwarded.pathname + forwarded.search).toBe(direct.pathname + direct.search);
		},
	);

	it('applies trustProxy to every request the built-in server handles', async () => {
		const seen = async (options: { trustProxy?: boolean }) => {
			const transport = createNodeServer((request) => new Response(request.url), options);
			const listener = transport.listen(0);
			await once(listener, 'listening');
			const address = listener.address();
			if (!address || typeof address === 'string') throw new Error('Node test server has no port');
			try {
				return await new Promise<{ status: number; port: number; body: string }>(
					(resolve, reject) => {
						const client = request(
							{
								host: '127.0.0.1',
								port: address.port,
								path: '/api/auth/sign-in?next=%2F',
								method: 'POST',
								agent: false,
								// Raw header lines: Node joins the repeated forwarded headers.
								headers: [
									'Host',
									`127.0.0.1:${address.port}`,
									'X-Forwarded-Proto',
									'https',
									'X-Forwarded-Proto',
									'http',
									'X-Forwarded-Host',
									'app.example.com',
									'Content-Length',
									'0',
								],
							},
							(response) => {
								let body = '';
								response.setEncoding('utf8');
								response.on('data', (chunk: string) => (body += chunk));
								response.on('end', () =>
									resolve({ status: response.statusCode ?? 0, port: address.port, body }),
								);
								response.on('error', reject);
							},
						);
						client.on('error', reject);
						client.end();
					},
				);
			} finally {
				const closed = once(listener, 'close');
				transport.close();
				await closed;
			}
		};

		const direct = await seen({});
		expect(direct.status).toBe(200);
		expect(direct.body).toBe(`http://127.0.0.1:${direct.port}/api/auth/sign-in?next=%2F`);
		const forwarded = await seen(trusted);
		expect(forwarded.status).toBe(200);
		expect(forwarded.body).toBe('https://app.example.com/api/auth/sign-in?next=%2F');
	});
});
