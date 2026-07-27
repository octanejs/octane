import { describe, expect, it } from 'vitest';
import { useSnapshot } from '@octanejs/valtio/react';
import { useProxy } from '@octanejs/valtio/react/utils';
import { proxy, snapshot } from '@octanejs/valtio/vanilla';
import { subscribeKey } from '@octanejs/valtio/vanilla/utils';

describe('vanilla entry points', () => {
	it('exports the Octane hooks from the React-compatible subpaths', () => {
		expect(typeof useSnapshot).toBe('function');
		expect(typeof useProxy).toBe('function');
	});

	it('re-exports the Valtio vanilla core unchanged', () => {
		const state = proxy({ count: 1 });
		expect(snapshot(state).count).toBe(1);
	});

	it('re-exports vanilla utilities', async () => {
		const state = proxy({ count: 0 });
		const values: number[] = [];
		const unsubscribe = subscribeKey(state, 'count', (value) => values.push(value), true);
		state.count = 1;
		unsubscribe();
		expect(values).toEqual([1]);
	});
});
