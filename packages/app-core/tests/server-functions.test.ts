// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Middleware } from '@octanejs/app-core';
import { __serverRpc, __serverRpcStream } from 'octane';
import { __serverRpcPreload } from 'octane/internal/server-rpc';
import { __registerServerFunction, type ServerCallContext } from 'octane/server';
import { createServerFunctions } from '../src/server/server-functions.js';

__serverRpcPreload();

const MODULE = '/src/data.tsrx';
/** The id the compiler gives the browser's stub for an export of MODULE. */
const id = (name: string) =>
	createHash('sha256')
		.update(MODULE + '#' + name)
		.digest('hex')
		.slice(0, 8);

/** A server build of MODULE, as the compiler emits its `module server` block. */
function serverBuild() {
	const whoami = __registerServerFunction(
		(label: string, call: ServerCallContext) => `${label}:${String(call.viewer)}`,
		1,
		{ id: id('whoami'), module: MODULE, export: 'whoami' },
	);
	return { _$_server_$_: { whoami, add: (a: number, b: number) => a + b } };
}

/** The app's authentication: a page sets the viewer itself; a browser call names it in a header. */
const authenticate: Middleware = async (context, next) => {
	context.viewer ??= context.request.headers.get('x-viewer') ?? undefined;
	return context.viewer === 'mallory' ? new Response(null, { status: 401 }) : next();
};

/** Route the browser's stubs to `handle`, as the app's server would. */
function browser(server: ReturnType<typeof createServerFunctions>, viewer: string) {
	vi.stubGlobal('location', new URL('https://app.test/notes'));
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const headers = new Headers(init?.headers);
		headers.set('x-viewer', viewer);
		const request = new Request(new URL(String(input), 'https://app.test'), { ...init, headers });
		return (await server.handle(request)) ?? new Response('page', { status: 200 });
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('createServerFunctions', () => {
	it("answers a browser's calls through the middleware, with the viewer it authenticated", async () => {
		const server = createServerFunctions({
			modules: { [MODULE]: serverBuild() },
			middlewares: [authenticate],
		});
		browser(server, 'ada');
		await expect(__serverRpcStream(id('whoami'), ['notes'])).resolves.toBe('notes:ada');
		await expect(__serverRpc(id('add'), [2, 3])).resolves.toBe(5);

		browser(server, 'mallory');
		await expect(__serverRpcStream(id('whoami'), ['notes'])).rejects.toThrow();
	});

	it('refuses other origins and unknown functions, and leaves other requests to the app', async () => {
		const server = createServerFunctions({ modules: { [MODULE]: serverBuild() } });
		const call = (hash: string, origin = 'https://app.test') =>
			server.handle(
				new Request(`https://app.test/_$_ripple_rpc_$_/${hash}`, {
					method: 'POST',
					headers: { origin, 'content-type': 'application/json' },
					// devalue's encoding of the arguments `[1, 2]`.
					body: '[[1,2],1,2]',
				}),
			);
		expect((await call(id('add')))!.status).toBe(200);
		expect((await call(id('add'), 'https://evil.test'))!.status).toBe(403);
		expect((await call('00000000'))!.status).toBe(404);
		expect(server.handle(new Request('https://app.test/notes'))).toBeNull();
	});

	it('runs a server render through the middleware, and its calls in process under that context', async () => {
		const build = serverBuild();
		const server = createServerFunctions({
			modules: { [MODULE]: build },
			middlewares: [authenticate],
		});
		const fetch = vi.spyOn(globalThis, 'fetch');
		const page = (viewer: string) =>
			server.respond(
				new Request('https://app.test/notes', { headers: { 'x-viewer': viewer } }),
				async (context) => {
					expect(context.viewer).toBe(viewer);
					return new Response(await build._$_server_$_.whoami('page'));
				},
			);

		const response = await page('grace');
		expect(await response.text()).toBe('page:grace');
		expect(fetch).not.toHaveBeenCalled();
		// The middleware answers instead of the page.
		expect((await page('mallory')).status).toBe(401);
	});

	it('rejects a module whose build has no module server block', () => {
		expect(() => createServerFunctions({ modules: { [MODULE]: {} } })).toThrow(
			/has no `module server` block/,
		);
	});
});
