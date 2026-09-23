import { once } from 'node:events';
import {
	Agent,
	createServer,
	request,
	type ClientRequest,
	type IncomingMessage,
	type RequestOptions,
	type Server,
	type ServerResponse,
} from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeServer, nodeRequestToWebRequest } from '../src/server/node-http.js';

const servers: Server[] = [];
const clients: ClientRequest[] = [];

afterEach(async () => {
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

function clientRequest(origin: string, options: RequestOptions = {}) {
	const client = request(origin, options);
	client.on('error', () => {});
	clients.push(client);
	return client;
}

describe('Node request cancellation', () => {
	it.each(['GET', 'POST'])(
		'aborts a disconnected %s handler before response headers',
		async (method) => {
			const entered = Promise.withResolvers<Request>();
			const release = Promise.withResolvers<void>();
			const server = createNodeServer(async (incoming) => {
				if (method === 'POST') await incoming.json();
				entered.resolve(incoming);
				await release.promise;
				return new Response('finished');
			}).listen(0);
			const response = once(server, 'request');
			const origin = await originOf(server);
			const client = clientRequest(origin, { method });
			client.end(method === 'POST' ? '{}' : undefined);
			try {
				const incoming = await entered.promise;
				const [, outgoing] = await response;
				const closed = once(outgoing, 'close');
				client.destroy();
				await closed;
				expect(incoming.signal.aborted).toBe(true);
			} finally {
				release.resolve();
			}
		},
	);

	it('aborts the signal and body reader when an upload disconnects', async () => {
		const entered = Promise.withResolvers<{ incoming: Request; body: Promise<unknown> }>();
		const server = createNodeServer(async (incoming) => {
			const body = incoming.json();
			entered.resolve({ incoming, body });
			try {
				await body;
			} catch {
				return new Response(null, { status: 204 });
			}
			return new Response('finished');
		}).listen(0);
		const response = once(server, 'request');
		const origin = await originOf(server);
		const client = clientRequest(origin, { method: 'POST' });
		client.write('{');
		const { incoming, body } = await entered.promise;
		const [, outgoing] = await response;
		const closed = once(outgoing, 'close');
		client.destroy();
		await closed;
		expect(incoming.signal.aborted).toBe(true);
		await expect(body).rejects.toThrow();
	});

	it('keeps cancellation attached after a handler returns its streaming response', async () => {
		let incoming!: Request;
		const cancelled = Promise.withResolvers<unknown>();
		const server = createNodeServer(async (request) => {
			await request.json();
			incoming = request;
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('shell'));
					},
					cancel(reason) {
						cancelled.resolve(reason);
					},
				}),
			);
		}).listen(0);
		const response = once(server, 'request');
		const origin = await originOf(server);
		const client = clientRequest(origin, { method: 'POST' });
		const receiving = once(client, 'response');
		client.end('{}');
		const [received] = await receiving;
		const [chunk] = await once(received, 'data');
		expect(chunk.toString()).toBe('shell');
		const [, outgoing] = await response;
		const closed = once(outgoing, 'close');
		client.destroy();
		await closed;
		expect(incoming.signal.aborted).toBe(true);
		expect(await cancelled.promise).toBeInstanceOf(Error);
	});

	it('does not cancel a completed request when a later keep-alive request disconnects', async () => {
		const agent = new Agent({ keepAlive: true, maxSockets: 1 });
		const incomingRequests: Request[] = [];
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const server = createNodeServer(async (incoming) => {
			await incoming.json();
			incomingRequests.push(incoming);
			if (incomingRequests.length === 2) {
				entered.resolve();
				await release.promise;
			}
			return new Response('finished');
		}).listen(0);
		const origin = await originOf(server);
		try {
			const first = clientRequest(origin, { method: 'POST', agent });
			const response = once(first, 'response');
			first.end('{}');
			const [received] = await response;
			received.resume();
			await once(received, 'end');
			expect(incomingRequests[0].signal.aborted).toBe(false);

			const secondResponse = once(server, 'request');
			const second = clientRequest(origin, { method: 'POST', agent });
			second.end('{}');
			await entered.promise;
			expect(second.reusedSocket).toBe(true);
			const [, outgoing] = await secondResponse;
			const closed = once(outgoing, 'close');
			second.destroy();
			await closed;
			expect(incomingRequests.map((incoming) => incoming.signal.aborted)).toEqual([false, true]);
		} finally {
			release.resolve();
			agent.destroy();
		}
	});

	it.each(['disconnect', 'finish'])(
		'handles a response that already closed after %s',
		async (ending) => {
			const consumed = Promise.withResolvers<[IncomingMessage, ServerResponse]>();
			const finish = Promise.withResolvers<void>();
			const server = createServer(async (incoming, outgoing) => {
				incoming.resume();
				await once(incoming, 'end');
				consumed.resolve([incoming, outgoing]);
				await finish.promise;
				if (!outgoing.destroyed) outgoing.end('finished');
			});
			const origin = await originOf(server.listen(0));
			const client = clientRequest(origin);
			client.on('response', (response) => response.resume());
			client.end();
			try {
				const [incoming, outgoing] = await consumed.promise;
				const closed = once(outgoing, 'close');
				if (ending === 'disconnect') client.destroy();
				else finish.resolve();
				await closed;
				expect(incoming.complete).toBe(true);
				const webRequest = nodeRequestToWebRequest(incoming, outgoing);
				expect(webRequest.signal.aborted).toBe(ending === 'disconnect');
			} finally {
				finish.resolve();
			}
		},
	);

	it.each([false, true])(
		'aborts an upload that disconnected before conversion (response: %s)',
		async (withResponse) => {
			const entered = Promise.withResolvers<[IncomingMessage, ServerResponse]>();
			const server = createServer((incoming, outgoing) => {
				entered.resolve([incoming, outgoing]);
			});
			const origin = await originOf(server.listen(0));
			const client = clientRequest(origin, { method: 'POST' });
			client.write('{');
			const [incoming, outgoing] = await entered.promise;
			const closed = once(outgoing, 'close');
			client.destroy();
			await closed;
			const webRequest = nodeRequestToWebRequest(incoming, withResponse ? outgoing : undefined);
			expect(webRequest.signal.aborted).toBe(true);
			await expect(webRequest.text()).rejects.toThrow();
		},
	);

	it('cancels a real upstream fetch when a consumed POST client disconnects', async () => {
		const upstreamResponse = Promise.withResolvers<import('node:http').ServerResponse>();
		const upstream = createServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.flushHeaders();
			upstreamResponse.resolve(res);
		});
		const upstreamOrigin = await originOf(upstream.listen(0));
		const entered = Promise.withResolvers<Request>();
		const settled = Promise.withResolvers<unknown>();
		const server = createNodeServer(async (incoming) => {
			await incoming.json();
			try {
				const response = await fetch(upstreamOrigin, { signal: incoming.signal });
				entered.resolve(incoming);
				await response.text();
				settled.resolve(null);
			} catch (error) {
				settled.resolve(error);
			}
			return new Response('finished');
		}).listen(0);
		const response = once(server, 'request');
		const origin = await originOf(server);
		const client = clientRequest(origin, { method: 'POST' });
		client.end('{}');
		const producing = await upstreamResponse.promise;
		const producerClosed = once(producing, 'close');
		try {
			const incoming = await entered.promise;
			const [, outgoing] = await response;
			const closed = once(outgoing, 'close');
			client.destroy();
			await closed;
			expect(incoming.signal.aborted).toBe(true);
			expect(await settled.promise).toBeInstanceOf(Error);
			await producerClosed;
			expect(producing.destroyed).toBe(true);
		} finally {
			producing.end();
			await settled.promise;
		}
	});
});
