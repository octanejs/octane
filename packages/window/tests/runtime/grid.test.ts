import { afterEach, describe, expect, it } from 'vitest';

import { act, flushEffects, mount } from '../../../octane/tests/_helpers';
import {
	GridHookInitializerFixture,
	GridRuntimeFixture,
	gridHookInitializerEvents,
	gridRuntimeEvents,
	resetGridRuntimeEvents,
} from '../_fixtures/grid-runtime.tsrx';

let unmount: (() => void) | undefined;

afterEach(() => {
	unmount?.();
	unmount = undefined;
	resetGridRuntimeEvents();
});

describe('Grid runtime', () => {
	it('preserves direct and lazy initial values for its ref helpers', () => {
		const result = mount(GridHookInitializerFixture);
		unmount = result.unmount;

		expect(gridHookInitializerEvents.ref).toMatchObject({ kind: 'grid-initial-api' });
		expect(gridHookInitializerEvents.callbackDirect).toMatchObject({ kind: 'grid-initial-api' });
		expect(gridHookInitializerEvents.callbackLazy).toMatchObject({ kind: 'grid-lazy-api' });
	});

	it('windows both axes and responds to native two-axis scrolling', async () => {
		const result = mount(GridRuntimeFixture);
		unmount = result.unmount;
		flushEffects();

		expect(result.findAll('[data-cell]')).toHaveLength(36);
		expect(result.find('[data-cell="0:0"]').getAttribute('role')).toBe('gridcell');
		expect(gridRuntimeEvents.ranges.at(-1)).toEqual({
			visible: {
				columnStartIndex: 0,
				columnStopIndex: 4,
				rowStartIndex: 0,
				rowStopIndex: 4,
			},
			overscan: {
				columnStartIndex: 0,
				columnStopIndex: 5,
				rowStartIndex: 0,
				rowStopIndex: 5,
			},
		});

		const grid = result.find('[data-testid="grid"]') as HTMLElement;
		grid.scrollLeft = 200;
		grid.scrollTop = 200;
		await act(() => grid.dispatchEvent(new Event('scroll')));
		flushEffects();

		expect(result.findAll('[data-cell]')).toHaveLength(49);
		expect(result.find('[data-cell="10:10"]')).toBeTruthy();
		expect(gridRuntimeEvents.ranges.at(-1)).toEqual({
			visible: {
				columnStartIndex: 10,
				columnStopIndex: 14,
				rowStartIndex: 10,
				rowStopIndex: 14,
			},
			overscan: {
				columnStartIndex: 9,
				columnStopIndex: 15,
				rowStartIndex: 9,
				rowStopIndex: 15,
			},
		});
	});

	it('exposes outer element and validates imperative row and column targets', () => {
		const result = mount(GridRuntimeFixture);
		unmount = result.unmount;
		const grid = result.find('[data-testid="grid"]');

		expect(gridRuntimeEvents.ref?.current?.element).toBe(grid);
		expect(() => gridRuntimeEvents.ref?.current?.scrollToColumn({ index: -1 })).toThrow(
			'Invalid index specified: -1',
		);
		expect(() => gridRuntimeEvents.ref?.current?.scrollToRow({ index: 100 })).toThrow(
			'Invalid index specified: 100',
		);
	});
});
