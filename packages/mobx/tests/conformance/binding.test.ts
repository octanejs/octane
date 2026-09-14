import { beforeEach, describe, expect, it } from 'vitest';
import { getObserverTree, observable } from '@octanejs/mobx';
import { mount, nextPaint } from '../_helpers';
import {
	Counter,
	LocalObservable,
	NestedValue,
	SwitchingValue,
	TwoCounters,
} from '../_fixtures/store.tsrx';

const createStore = () =>
	observable({
		count: 0,
		other: 0,
		nested: { label: 'Ada' },
	});

describe('MobX observer binding', () => {
	let store: ReturnType<typeof createStore>;

	beforeEach(() => {
		store = createStore();
	});

	// @parity-case native:mobx-e6bb553f8290
	it('tracks observables read by an observed component', async () => {
		let renders = 0;
		const result = mount(Counter, { store, rendered: () => renders++ });
		expect(result.find('#count').textContent).toBe('0');
		expect(renders).toBe(1);

		store.count = 2;
		await nextPaint();
		expect(result.find('#count').textContent).toBe('2');
		expect(renders).toBe(2);
		result.unmount();
	});

	// @parity-case native:mobx-405b5d245cdc
	it('does not rerender for observables that were not read', async () => {
		let renders = 0;
		const result = mount(Counter, { store, rendered: () => renders++ });
		store.other = 4;
		await nextPaint();
		expect(renders).toBe(1);
		result.unmount();
	});

	// @parity-case native:mobx-533352b3496b
	it('switches tracked dependencies after a local-state update', async () => {
		const result = mount(SwitchingValue, { store });
		expect(result.find('#selected').textContent).toBe('0');

		result.click('#switch');
		expect(result.find('#selected').textContent).toBe('0');
		store.other = 7;
		await nextPaint();
		expect(result.find('#selected').textContent).toBe('7');

		store.count = 9;
		await nextPaint();
		expect(result.find('#selected').textContent).toBe('7');
		result.unmount();
	});

	// @parity-case native:mobx-0ebcd8f4a8a2
	it('tracks nested observable reads', async () => {
		const result = mount(NestedValue, { store });
		store.nested.label = 'Grace';
		await nextPaint();
		expect(result.find('#nested').textContent).toBe('Grace');
		result.unmount();
	});

	// @parity-case native:mobx-b41501881aa6
	it('keeps multiple observed stores independent', async () => {
		const right = createStore();
		right.count = 10;
		const result = mount(TwoCounters, { left: store, right });

		store.count = 3;
		await nextPaint();
		expect(result.find('#left').textContent).toBe('3');
		expect(result.find('#right').textContent).toBe('10');
		result.unmount();
	});

	// @parity-case native:mobx-4cb7657963b3
	it('creates a stable auto-bound local observable', async () => {
		const result = mount(LocalObservable, {});
		result.click('#local');
		await nextPaint();
		expect(result.find('#local').textContent).toBe('1');
		result.unmount();
	});

	// @parity-case native:mobx-e48dd9045c11
	it('disposes the MobX reaction on unmount', async () => {
		const result = mount(Counter, { store, rendered: () => {} });
		await nextPaint();
		expect(getObserverTree(store, 'count').observers?.length).toBe(1);
		result.unmount();
		await nextPaint();
		expect(getObserverTree(store, 'count').observers).toBeUndefined();
	});
});
