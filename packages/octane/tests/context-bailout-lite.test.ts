import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import { AppLite } from './_fixtures/context-bailout-lite.tsrx';

describe('context propagation through lightweight component scopes', () => {
	it('updates retained context consumers below memo without replacing their DOM', () => {
		const retained = [{ id: 'A' }, { id: 'B' }];
		for (const memoized of [false, true]) {
			const r = mount(AppLite, {
				memoized,
				identity: { label: 'one' },
				active: 'A',
				retained,
			});
			const originalA = r.find('output[data-owner="A"]');
			const update = (active: string, label: string) =>
				r.update(AppLite, { memoized, identity: { label }, active, retained });
			expect(originalA.textContent).toBe('one');

			update('A', 'two');
			expect(r.find('output[data-owner="A"]').textContent).toBe('two');

			update('B', 'three');
			expect(r.find('output[data-owner="B"]').textContent).toBe('three');
			update('B', 'four');
			expect(r.find('output[data-owner="B"]').textContent).toBe('four');

			update('A', 'five');
			const restoredA = r.find('output[data-owner="A"]');
			expect(restoredA).toBe(originalA);
			expect(restoredA.textContent).toBe('five');
			r.unmount();
		}
	});
});
