import { describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { cache } from '../../src/_internal/index';
import { renderTrace, SWRReader } from '../upstream/root/fixtures.tsrx';

// Octane-only request-state oracle. Not counted as React-parity differential evidence —
// unpaired because it drives only the Octane fixture rather than a React/Octane pair.

async function settle() {
	for (let index = 0; index < 8; index++) {
		await Promise.resolve();
		flushSync(function () {});
		drainPassiveEffects();
	}
}

describe('SWR U3 Octane root request-state oracle', () => {
	it('matches request-state and callback ordering', async () => {
		renderTrace.length = 0;
		const callbacks: string[] = [];
		const fetcher = vi.fn(async function () {
			return 'data';
		});
		const container = document.createElement('div');
		const root = createRoot(container);
		root.render(SWRReader, {
			cacheKey: 'unit-root-trace',
			fetcher,
			config: {
				onSuccess: function () {
					callbacks.push('success');
				},
				onError: function () {
					callbacks.push('error');
				},
			},
		});
		flushSync(function () {});
		drainPassiveEffects();
		await settle();

		const distinct = renderTrace.filter(function (value, index, values) {
			return index === 0 || JSON.stringify(value) !== JSON.stringify(values[index - 1]);
		});
		expect(distinct).toEqual([
			{ data: undefined, error: undefined, isLoading: true, isValidating: true },
			{ data: 'data', error: undefined, isLoading: false, isValidating: false },
		]);
		expect(callbacks).toEqual(['success']);
		expect(fetcher).toHaveBeenCalledOnce();
		root.unmount();
		for (const key of [...cache.keys()]) cache.delete(key);
	});
});
