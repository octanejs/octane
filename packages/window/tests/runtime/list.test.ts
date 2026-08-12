import { afterEach, describe, expect, it } from 'vitest';

import { act, flushEffects, mount } from '../../../octane/tests/_helpers';
import {
	ListHookInitializerFixture,
	ListRuntimeFixture,
	listHookInitializerEvents,
	listRuntimeEvents,
	resetListRuntimeEvents,
} from '../_fixtures/list-runtime.tsrx';

let unmount: (() => void) | undefined;

afterEach(() => {
	unmount?.();
	unmount = undefined;
	resetListRuntimeEvents();
});

describe('List runtime', () => {
	it('preserves direct and lazy initial values for its ref helpers', () => {
		const result = mount(ListHookInitializerFixture);
		unmount = result.unmount;

		expect(listHookInitializerEvents.ref).toMatchObject({ kind: 'list-initial-api' });
		expect(listHookInitializerEvents.callbackDirect).toMatchObject({ kind: 'list-initial-api' });
		expect(listHookInitializerEvents.callbackLazy).toMatchObject({ kind: 'list-lazy-api' });
	});

	it('renders only the visible plus overscan range and responds to native scroll', async () => {
		const result = mount(ListRuntimeFixture);
		unmount = result.unmount;
		flushEffects();

		expect(result.findAll('[data-index]').map((row) => row.getAttribute('data-index'))).toEqual([
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
		]);
		expect(result.findAll('[data-index]')).toHaveLength(6);
		expect(listRuntimeEvents.ranges.at(-1)).toEqual({
			visible: { startIndex: 0, stopIndex: 4 },
			overscan: { startIndex: 0, stopIndex: 5 },
		});

		const list = result.find('[data-testid="list"]') as HTMLElement;
		list.scrollTop = 200;
		await act(() => list.dispatchEvent(new Event('scroll')));
		flushEffects();

		expect(result.findAll('[data-index]').map((row) => row.getAttribute('data-index'))).toEqual([
			'9',
			'10',
			'11',
			'12',
			'13',
			'14',
			'15',
		]);
		expect(listRuntimeEvents.ranges.at(-1)).toEqual({
			visible: { startIndex: 10, stopIndex: 14 },
			overscan: { startIndex: 9, stopIndex: 15 },
		});
	});

	it('exposes the outer element and exact range errors through its imperative API', () => {
		const result = mount(ListRuntimeFixture);
		unmount = result.unmount;
		const list = result.find('[data-testid="list"]');

		expect(listRuntimeEvents.ref?.current?.element).toBe(list);
		expect(() => listRuntimeEvents.ref?.current?.scrollToRow({ index: 100 })).toThrow(
			'Invalid index specified: 100',
		);
	});
});
