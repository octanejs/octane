import { describe, expect, it } from 'vitest';
import {
	getServerRouterEntry,
	normalizeRequestUrl,
	warmServerRouter,
} from '../src/app/router-server.ts';
import { waitForRouterMatches } from '../src/app/router-client.ts';

describe('website router safety guards', () => {
	it('normalizes path spelling while preserving request search', () => {
		expect(normalizeRequestUrl('docs/?user=ada')).toBe('/docs?user=ada');
	});

	it('reuses one loaded router only within the same request state', async () => {
		const state = new Map<string, unknown>();
		await warmServerRouter(state, '/docs?user=ada');
		const warmed = getServerRouterEntry(state, '/docs?user=ada');
		expect(warmed.done).toBe(true);
		expect(getServerRouterEntry(state, '/docs?user=ada')).toBe(warmed);
	});

	it('never shares a loaded router between requests for the same URL', async () => {
		const firstState = new Map<string, unknown>();
		const secondState = new Map<string, unknown>();
		await Promise.all([
			warmServerRouter(firstState, '/docs'),
			warmServerRouter(secondState, '/docs'),
		]);
		expect(getServerRouterEntry(firstState, '/docs').router).not.toBe(
			getServerRouterEntry(secondState, '/docs').router,
		);
	});

	it('stops hydration with a local diagnostic when matches never commit', async () => {
		const router = {
			latestLocation: { href: '/stuck' },
			stores: { matches: { get: () => [] } },
		};
		let turns = 0;
		await expect(
			waitForRouterMatches(router, 3, async () => {
				turns++;
			}),
		).rejects.toThrow('no matches were committed after 3 timer turns');
		expect(turns).toBe(3);
	});

	it('returns as soon as router matches become visible', async () => {
		let turns = 0;
		const router = {
			stores: { matches: { get: () => (turns === 2 ? [{ id: '/' }] : []) } },
		};
		await waitForRouterMatches(router, 5, async () => {
			turns++;
		});
		expect(turns).toBe(2);
	});
});
