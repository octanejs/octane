// @vitest-environment node

// The website dev server renders every document in Nitro's SSR worker, reached
// through env-runner's httpxy proxy over pooled keep-alive sockets. A request
// the worker drops unanswered on a pooled socket must be replayed, not turned
// into Vite's 500 page and an error overlay on every open page (see the httpxy
// patch in pnpm-workspace.yaml). The proxy is resolved through Nitro so these
// cases cover the copy the dev server loads.
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, expect, it } from 'vitest';

type ProxyFetch = (
	address: { host: string; port: number },
	input: string,
	init?: RequestInit,
) => Promise<Response>;

const fromNitro = createRequire(createRequire(import.meta.url).resolve('nitro/package.json'));
const fromEnvRunner = createRequire(fromNitro.resolve('env-runner'));
const { proxyFetch } = (await import(fromEnvRunner.resolve('httpxy'))) as {
	proxyFetch: ProxyFetch;
};

let server: Server | undefined;

afterEach(async () => {
	if (!server) return;
	server.closeAllConnections();
	await new Promise((resolve) => server!.close(resolve));
	server = undefined;
});

// Answers the first request on each connection and drops every later one
// unanswered, as the worker does when its idle timer wins that race. Records
// each request as [method and path, requests already served on its socket].
async function workerThatDropsPooledRequests() {
	const seen: [string, number][] = [];
	const served = new WeakMap<Socket, number>();
	server = createServer((request, response) => {
		const count = served.get(request.socket) ?? 0;
		served.set(request.socket, count + 1);
		seen.push([`${request.method} ${request.url}`, count]);
		if (count > 0) request.socket.destroy();
		else response.end(request.url);
	});
	await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	const address = { host: '127.0.0.1', port };
	return { seen, address, origin: `http://localhost:${port}` };
}

it('replays a document request whose pooled socket the SSR worker closed', async () => {
	const { seen, address, origin } = await workerThatDropsPooledRequests();
	expect(await (await proxyFetch(address, `${origin}/docs`)).text()).toBe('/docs');

	const response = await proxyFetch(address, `${origin}/docs/core-apis`);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe('/docs/core-apis');
	expect(seen).toEqual([
		['GET /docs', 0],
		['GET /docs/core-apis', 1],
		['GET /docs/core-apis', 0],
	]);
});

it('does not send a request body to the worker twice', async () => {
	const { seen, address, origin } = await workerThatDropsPooledRequests();
	await (await proxyFetch(address, `${origin}/`)).text();

	await expect(
		proxyFetch(address, `${origin}/_serverFn/save`, { method: 'POST', body: 'name=Ada' }),
	).rejects.toMatchObject({ code: 'ECONNRESET' });
	expect(seen).toEqual([
		['GET /', 0],
		['POST /_serverFn/save', 1],
	]);
});
