import { describe, expect, it } from 'vitest';
import { withAssetsFallthrough } from '../src/assets-fallback.js';

describe('withAssetsFallthrough', () => {
	it('passes non-404 responses through untouched', async () => {
		const response = new Response('ok', { status: 200 });
		const wrapped = withAssetsFallthrough(async () => response);

		expect(await wrapped(new Request('https://example.com/'))).toBe(response);
	});

	it('serves 404 responses from the ASSETS binding', async () => {
		const asset = new Response('js', { status: 200 });
		const assets = { fetch: async () => asset };
		const wrapped = withAssetsFallthrough(async () => new Response('not found', { status: 404 }));

		const response = await wrapped(new Request('https://example.com/assets/app.js'), {
			ASSETS: assets,
		});

		expect(response).toBe(asset);
	});

	it('returns the original 404 when no ASSETS binding exists', async () => {
		const notFound = new Response('not found', { status: 404 });
		const wrapped = withAssetsFallthrough(async () => notFound);

		expect(await wrapped(new Request('https://example.com/miss'), {})).toBe(notFound);
	});

	it('spreads worker arguments through to the underlying handler', async () => {
		const seen: unknown[] = [];
		const wrapped = withAssetsFallthrough(async (...args) => {
			seen.push(...args);
			return new Response('ok');
		});
		const request = new Request('https://example.com/');
		const env = { ASSETS: { fetch: async () => new Response('x') } };
		const ctx = { waitUntil: () => {} };

		await wrapped(request, env, ctx);

		expect(seen).toEqual([request, env, ctx]);
	});
});
