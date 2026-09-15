import { expect, it } from 'vitest';
import { observable } from '@octanejs/mobx';
import { mount, nextPaint } from '../_helpers';
import { CallbackRegion, CallbackHook, CallbackObserver } from '../_fixtures/store.tsrx';

it.each([
	['Observer', CallbackRegion],
	['useObserver', CallbackHook],
	['observer', CallbackObserver],
] as const)('tracks observable reads in a %s render callback', async (_name, Component) => {
	const store = observable({ count: 0, other: 0, nested: { label: 'Ada' } });
	const result = mount(Component, { store });
	try {
		expect(result.find('#callback-count').textContent).toBe('0');
		store.count = 4;
		await nextPaint();
		expect(result.find('#callback-count').textContent).toBe('4');
	} finally {
		result.unmount();
	}
});
