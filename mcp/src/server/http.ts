// Small HTTP helpers shared by the v1 routes. Kept dependency-free so routes.ts
// (and therefore octane.config.ts) can import this statically without pulling
// anything heavy into the config graph.
import type { Middleware } from '@octanejs/vite-plugin';

// Browser-based MCP clients call the endpoint cross-origin; the MCP headers
// must be both accepted (request) and readable (response).
export const CORS_HEADERS: Record<string, string> = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
	'access-control-allow-headers':
		'content-type, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
	'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
	'access-control-max-age': '86400',
};

export const cors: Middleware = async (context, next) => {
	if (context.request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}
	const response = await next();
	for (const [name, value] of Object.entries(CORS_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
};

// Content is frozen into the build, so responses are freely cacheable; an hour
// keeps CDN traffic low while a redeploy still propagates the same day.
const CACHEABLE = 'public, max-age=3600';

export function json(data: unknown, init: ResponseInit & { cache?: boolean } = {}): Response {
	const { cache = true, ...responseInit } = init;
	return new Response(JSON.stringify(data, null, 2), {
		...responseInit,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			...(cache ? { 'cache-control': CACHEABLE } : {}),
			...responseInit.headers,
		},
	});
}

export function plainText(body: string): Response {
	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': CACHEABLE,
		},
	});
}

export function methodNotAllowed(allow: string): Response {
	return new Response('Method Not Allowed', { status: 405, headers: { allow } });
}
