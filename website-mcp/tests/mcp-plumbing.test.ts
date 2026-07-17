// The consumer-visible HTTP contract of the route table, driven in-process
// through the same dispatch production uses (handleServerRoute runs the
// before/handler/after chain): MCP POSTs succeed per-request, non-POST MCP
// methods are refused, CORS preflights answer, and the REST shapes hold.
import { describe, expect, it } from 'vitest';
import { createContext, handleServerRoute, type ServerRoute } from '@octanejs/vite-plugin';
import { serverRoutes } from '../src/server/routes.ts';

function route(path: string): ServerRoute {
	const match = serverRoutes.find((entry) => entry.path === path);
	if (!match) throw new Error(`no route for ${path}`);
	return match;
}

async function dispatch(
	path: string,
	init: RequestInit = {},
	params: Record<string, string> = {},
): Promise<Response> {
	const request = new Request(`http://mcp.octanejs.dev${path}`, init);
	return handleServerRoute(route(path), createContext(request, params), []);
}

const MCP_HEADERS = {
	'content-type': 'application/json',
	accept: 'application/json, text/event-stream',
};

function rpc(method: string, params: unknown, id = 1) {
	return JSON.stringify({ jsonrpc: '2.0', id, method, params });
}

const INITIALIZE = rpc('initialize', {
	protocolVersion: '2025-06-18',
	capabilities: {},
	clientInfo: { name: 'plumbing-tests', version: '0.0.0' },
});

describe('/v1/mcp plumbing', () => {
	it('answers initialize with buffered JSON and the server identity', async () => {
		const response = await dispatch('/v1/mcp', {
			method: 'POST',
			headers: MCP_HEADERS,
			body: INITIALIZE,
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');
		const body = await response.json();
		expect(body.result.serverInfo.name).toBe('octane');
		expect(body.result.capabilities.tools).toBeDefined();
	});

	it('serves sequential requests — each POST gets a fresh stateless transport', async () => {
		// A reused stateless transport throws in the SDK; two identical
		// initializes succeeding proves the per-request construction.
		for (let i = 0; i < 2; i++) {
			const response = await dispatch('/v1/mcp', {
				method: 'POST',
				headers: MCP_HEADERS,
				body: INITIALIZE,
			});
			expect(response.status).toBe(200);
		}
	});

	it('refuses GET and DELETE (no server-push stream, no session) with Allow', async () => {
		for (const method of ['GET', 'DELETE']) {
			const response = await dispatch('/v1/mcp', { method });
			expect(response.status).toBe(405);
			expect(response.headers.get('allow')).toBe('POST');
		}
	});

	it('answers CORS preflight without touching the transport', async () => {
		const response = await dispatch('/v1/mcp', { method: 'OPTIONS' });
		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
		expect(response.headers.get('access-control-allow-headers')).toContain('mcp-session-id');
	});

	it('applies CORS headers to actual responses', async () => {
		const response = await dispatch('/v1/mcp', {
			method: 'POST',
			headers: MCP_HEADERS,
			body: INITIALIZE,
		});
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
	});
});

describe('/v1 REST plumbing', () => {
	it('serves the docs index with cacheable JSON', async () => {
		const response = await dispatch('/v1/docs');
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toContain('max-age');
		const body = await response.json();
		expect(body.docs.map((doc: { slug: string }) => doc.slug)).toContain('quick-start');
		// The index is a table of contents, not the corpus.
		expect(body.docs[0].markdown).toBeUndefined();
	});

	it('serves one doc by slug param and 404s unknown slugs with the valid list', async () => {
		const ok = await dispatch('/v1/docs/:slug', {}, { slug: 'tsrx-vs-tsx' });
		expect(ok.status).toBe(200);
		const doc = await ok.json();
		expect(doc.slug).toBe('tsrx-vs-tsx');
		expect(doc.markdown.length).toBeGreaterThan(500);

		const missing = await dispatch('/v1/docs/:slug', {}, { slug: 'nope' });
		expect(missing.status).toBe(404);
		const error = await missing.json();
		expect(error.slugs).toContain('core-apis');
	});

	it('serves the bindings snapshot', async () => {
		const response = await dispatch('/v1/bindings');
		const body = await response.json();
		expect(body.count).toBeGreaterThan(20);
		expect(body.reactToOctane['zustand']).toBe('@octanejs/zustand');
		expect(body.statuses[0].upstream.package).toBeDefined();
	});

	it('serves llms.txt and llms-full.txt as plain text', async () => {
		const short = await dispatch('/llms.txt');
		expect(short.headers.get('content-type')).toContain('text/plain');
		const shortBody = await short.text();
		expect(shortBody.startsWith('# Octane')).toBe(true);

		const full = await dispatch('/llms-full.txt');
		const fullBody = await full.text();
		expect(fullBody.length).toBeGreaterThan(shortBody.length * 3);
	});
});
