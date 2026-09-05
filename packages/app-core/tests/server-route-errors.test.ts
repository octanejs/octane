// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerRoute } from '../src/routes.js';
import { createHandler } from '../src/server/production.js';

const TEMPLATE = `<!doctype html><html><head><!--ssr-head--></head><body><!--ssr-body-->
<script type="module" data-octane-hydrate src="/assets/hydrate.js"></script></body></html>`;

function createApiHandler(route: ServerRoute) {
	return createHandler(
		{ routes: [route], components: {}, layouts: {}, middlewares: [] },
		{
			htmlTemplate: TEMPLATE,
			renderToReadableStream: async () => new ReadableStream(),
			prerender: async () => ({ html: '', css: '' }),
			executeServerFunction: async (fn, body) => String(await fn(body)),
			Suspense: () => undefined,
			ErrorBoundary: () => undefined,
			createElement: () => undefined,
		},
	);
}

afterEach(() => vi.restoreAllMocks());

describe('production API route errors', () => {
	it('keeps thrown details in server diagnostics without exposing them to the client', async () => {
		const error = new Error('private database password: marker-7531');
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const handler = createApiHandler(
			new ServerRoute({
				path: '/private',
				handler: async () => {
					throw error;
				},
			}),
		);

		const response = await handler(new Request('https://octane.test/private'));

		expect(response.status).toBe(500);
		expect(response.headers.get('content-type')).toContain('application/json');
		await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' });
		expect(logged).toHaveBeenCalledWith('[octane] API route error:', error);
	});

	it('preserves an intentional API error response', async () => {
		const handler = createApiHandler(
			new ServerRoute({
				path: '/public-error',
				handler: () =>
					new Response(JSON.stringify({ error: 'Please try again' }), {
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					}),
			}),
		);

		const response = await handler(new Request('https://octane.test/public-error'));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Please try again' });
	});
});
