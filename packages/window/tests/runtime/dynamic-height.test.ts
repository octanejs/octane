import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, flushEffects, mount } from '../../../octane/tests/_helpers';
import { DATA_ATTRIBUTE_LIST_INDEX } from '../../src/components/list/List';
import {
	DynamicHeightFixture,
	dynamicHeightApi,
	resetDynamicHeightFixture,
} from '../_fixtures/dynamic-height.tsrx';

class ResizeObserverMock {
	static instances: ResizeObserverMock[] = [];
	readonly observe = vi.fn();
	readonly unobserve = vi.fn();
	readonly disconnect = vi.fn();

	constructor(readonly callback: ResizeObserverCallback) {
		ResizeObserverMock.instances.push(this);
	}
}

let originalResizeObserver: typeof ResizeObserver | undefined;
let unmount: (() => void) | undefined;

beforeEach(() => {
	originalResizeObserver = globalThis.ResizeObserver;
	ResizeObserverMock.instances.length = 0;
	globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

afterEach(() => {
	unmount?.();
	unmount = undefined;
	resetDynamicHeightFixture();
	if (originalResizeObserver === undefined) {
		delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
	} else {
		globalThis.ResizeObserver = originalResizeObserver;
	}
});

describe('useDynamicRowHeight', () => {
	it('observes rows, updates measured height, unobserves, and disconnects on unmount', async () => {
		const result = mount(DynamicHeightFixture);
		unmount = result.unmount;
		flushEffects();
		const observer = ResizeObserverMock.instances[0];
		const row = document.createElement('div');
		row.setAttribute(DATA_ATTRIBUTE_LIST_INDEX, '7');

		const release = dynamicHeightApi!.observeRowElements([row]);
		expect(observer.observe).toHaveBeenCalledWith(row);
		await act(() =>
			observer.callback(
				[
					{
						borderBoxSize: [{ blockSize: 37 }],
						target: row,
					} as unknown as ResizeObserverEntry,
				],
				observer as unknown as ResizeObserver,
			),
		);
		expect(dynamicHeightApi!.getRowHeight(7)).toBe(37);

		release();
		expect(observer.unobserve).toHaveBeenCalledWith(row);
		result.unmount();
		unmount = undefined;
		flushEffects();
		expect(observer.disconnect).toHaveBeenCalledOnce();
	});
});
