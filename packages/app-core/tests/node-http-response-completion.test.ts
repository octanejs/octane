import { once } from 'node:events';
import {
	createServer,
	request,
	type ClientRequest,
	type IncomingHttpHeaders,
	type Server,
} from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createNodeServer,
	nodeRequestToWebRequest,
	sendWebResponse,
} from '../src/server/node-http.js';

type Handler = (request: Request) => Response | Promise<Response>;

const servers: Server[] = [];
const clients: ClientRequest[] = [];
const encoder = new TextEncoder();

afterEach(async () => {
	vi.restoreAllMocks();
	for (const client of clients.splice(0)) client.destroy();
	await Promise.all(
		servers.splice(0).map(async (server) => {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}),
	);
});

async function originOf(server: Server) {
	servers.push(server);
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Server has no TCP address');
	return `http://127.0.0.1:${address.port}`;
}

/** The built-in production server. */
function serveBuiltIn(handler: Handler) {
	return originOf(createNodeServer(handler).listen(0));
}

/**
 * The exported sender, as the generated serverless handler and the dev
 * middlewares call it: no request argument, and the caller owns the 500.
 */
function serveExported(handler: Handler, failures: { error: unknown; destroyed: boolean }[] = []) {
	const server = createServer(async (req, res) => {
		try {
			await sendWebResponse(res, await handler(nodeRequestToWebRequest(req, res)));
		} catch (error) {
			failures.push({ error, destroyed: res.destroyed });
			if (!res.headersSent) {
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
		}
	});
	return originOf(server.listen(0));
}

const transports = { createNodeServer: serveBuiltIn, sendWebResponse: serveExported };

interface Exchange {
	status: number;
	headers: IncomingHttpHeaders;
	body: string;
	ended: boolean;
	aborted: boolean;
	complete: boolean;
}

function exchange(
	origin: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		onFirstChunk?: () => void;
	} = {},
) {
	return new Promise<Exchange>((resolve, reject) => {
		const client = request(
			origin,
			{
				method: options.method ?? 'GET',
				agent: false,
				headers: { Connection: 'close', 'Accept-Encoding': 'identity', ...options.headers },
			},
			(response) => {
				let body = '';
				let ended = false;
				let aborted = false;
				response.setEncoding('utf8');
				response.on('data', (chunk: string) => {
					const first = body === '';
					body += chunk;
					if (first) options.onFirstChunk?.();
				});
				response.on('end', () => (ended = true));
				response.on('aborted', () => (aborted = true));
				response.on('error', () => {});
				response.on('close', () => {
					resolve({
						status: response.statusCode ?? 0,
						headers: response.headers,
						body,
						ended,
						aborted,
						complete: response.complete,
					});
				});
			},
		);
		clients.push(client);
		client.on('error', reject);
		client.end();
	});
}

/** Bound a wait that must settle without the producer's help. */
async function settlesWithoutProducer<T>(promise: Promise<T>, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const bound = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), 2000);
	});
	try {
		return await Promise.race([promise, bound]);
	} finally {
		clearTimeout(timer);
	}
}

/** A streamed body whose first line is sent before the producer settles. */
function openStream() {
	let producer!: ReadableStreamDefaultController<Uint8Array>;
	const cancelled = Promise.withResolvers<unknown>();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			producer = controller;
			controller.enqueue(encoder.encode('first-line\n'));
		},
		cancel(reason) {
			cancelled.resolve(reason);
		},
	});
	return { body, cancelled: cancelled.promise, producer: () => producer };
}

describe('Node streamed response completion', () => {
	it('completes a healthy streamed response after its producer closes', async () => {
		const stream = openStream();
		const origin = await serveBuiltIn(
			() => new Response(stream.body, { headers: { 'Content-Type': 'text/plain' } }),
		);
		const result = await exchange(origin, {
			onFirstChunk() {
				stream.producer().enqueue(encoder.encode('last-line\n'));
				stream.producer().close();
			},
		});
		expect(result).toMatchObject({
			status: 200,
			body: 'first-line\nlast-line\n',
			ended: true,
			aborted: false,
			complete: true,
		});
	});

	it('aborts a streamed response whose body fails after its headers were sent', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('producer failed');
		const stream = openStream();
		const origin = await serveBuiltIn(
			() => new Response(stream.body, { headers: { 'Content-Type': 'text/plain' } }),
		);
		const result = await exchange(origin, {
			onFirstChunk: () => stream.producer().error(failure),
		});
		// The committed status cannot change, so the only honest signal left is an
		// interrupted transfer. No transport text may be appended to the body.
		expect(result).toMatchObject({
			status: 200,
			body: 'first-line\n',
			ended: false,
			aborted: true,
			complete: false,
		});
		expect(logged).toHaveBeenCalledWith('[octane] Request error:', failure);
	});

	it('aborts the transfer before sendWebResponse rejects with a late body failure', async () => {
		const failures: { error: unknown; destroyed: boolean }[] = [];
		const failure = new Error('producer failed');
		const stream = openStream();
		const origin = await serveExported(() => new Response(stream.body), failures);
		// This caller writes nothing once headers are sent, so the sender itself
		// must end the transfer.
		const result = await settlesWithoutProducer(
			exchange(origin, { onFirstChunk: () => stream.producer().error(failure) }),
			'sendWebResponse left a failed response open',
		);
		expect(result).toMatchObject({ status: 200, body: 'first-line\n', aborted: true });
		expect(failures).toEqual([{ error: failure, destroyed: true }]);
	});

	it('answers 500 without detail when the handler fails before a response exists', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const origin = await serveBuiltIn(() => {
			throw new Error('private handler detail');
		});
		const result = await exchange(origin);
		expect(result).toMatchObject({
			status: 500,
			body: 'Internal Server Error',
			complete: true,
			aborted: false,
		});
		expect(result.headers['content-type']).toBe('text/plain; charset=utf-8');
	});

	it.each([
		['a negotiated gzip encoding', { 'Accept-Encoding': 'gzip' }, {}],
		['a declared content length', {}, { 'Content-Length': '4096' }],
	])(
		'answers a clean 500 when the body fails before its first byte under %s',
		async (_, requestHeaders, responseHeaders) => {
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			const failure = new Error('private body detail');
			const origin = await serveBuiltIn(
				() =>
					new Response(
						new ReadableStream<Uint8Array>({
							start(controller) {
								controller.error(failure);
							},
						}),
						{
							headers: {
								'Content-Type': 'text/html; charset=utf-8',
								'X-Representation': 'failed',
								...responseHeaders,
							},
						},
					),
			);
			const result = await exchange(origin, { headers: requestHeaders });
			expect(result).toMatchObject({
				status: 500,
				body: 'Internal Server Error',
				complete: true,
				aborted: false,
			});
			// The failed representation's framing and metadata must not describe the
			// error response that replaces it.
			expect(result.headers['content-type']).toBe('text/plain; charset=utf-8');
			expect(result.headers['content-encoding']).toBeUndefined();
			expect(result.headers['content-length']).not.toBe('4096');
			expect(result.headers['x-representation']).toBeUndefined();
			expect(logged).toHaveBeenCalledWith('[octane] Request error:', failure);
		},
	);
});

describe.each(Object.entries(transports))('Node HEAD responses through %s', (_, serve) => {
	it('ends with the ready headers and cancels an open streaming body', async () => {
		const stream = openStream();
		const origin = await serve(
			() =>
				new Response(stream.body, {
					headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Ready': 'yes' },
				}),
		);
		const result = await settlesWithoutProducer(
			exchange(origin, { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } }),
			'HEAD waited for its unused body to close',
		);
		expect(result).toMatchObject({ status: 200, body: '', complete: true, aborted: false });
		expect(result.headers['x-ready']).toBe('yes');
		expect(result.headers['content-encoding']).toBeUndefined();
		await settlesWithoutProducer(stream.cancelled, 'HEAD did not release its producer');
	});

	it.each([
		['a null body', () => new Response(null, { headers: { 'X-Ready': 'yes' } })],
		[
			'a finite body',
			() => new Response('ok', { headers: { 'X-Ready': 'yes', 'Content-Length': '2' } }),
		],
	])('keeps the metadata of %s', async (label, respond) => {
		const origin = await serve(respond);
		const result = await exchange(origin, { method: 'HEAD' });
		expect(result).toMatchObject({ status: 200, body: '', complete: true, aborted: false });
		expect(result.headers['x-ready']).toBe('yes');
		expect(result.headers['content-length']).toBe(label === 'a finite body' ? '2' : undefined);
	});
});
