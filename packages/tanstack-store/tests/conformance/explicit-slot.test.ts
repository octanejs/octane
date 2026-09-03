import { expect, it } from 'vitest';
import { createAtom } from '@octanejs/tanstack-store';
import { mount, nextPaint } from '../_helpers';
import { ExplicitSelectorPair } from '../_fixtures/explicit-slot.tsrx';

it.each([false, true])(
	'keeps authored explicit subscriptions independent with legacy=%s',
	async (legacy) => {
		const left = createAtom(1);
		const right = createAtom(10);
		const result = mount(ExplicitSelectorPair, { left, right, legacy });
		try {
			expect(result.find('#pair').textContent).toBe('1/10');
			left.set(2);
			await nextPaint();
			expect(result.find('#pair').textContent).toBe('2/10');
			right.set(15);
			await nextPaint();
			expect(result.find('#pair').textContent).toBe('2/15');
		} finally {
			result.unmount();
		}
	},
);
