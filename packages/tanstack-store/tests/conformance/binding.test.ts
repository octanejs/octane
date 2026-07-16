import { describe, expect, it } from 'vitest';
import { createAtom, createStore } from '@octanejs/tanstack-store';
import { mount, nextPaint } from '../_helpers';
import {
	AtomTuple,
	ComparedSelection,
	CreatedAtoms,
	CreatedStores,
	DerivedPair,
	LegacyStore,
	MissingProvider,
	NestedProviders,
	SelectorPair,
	SubscriptionReader,
	SwitchingSource,
} from '../_fixtures/conformance.tsrx';

describe('selectors', () => {
	it('keeps multiple atom subscriptions independent', async () => {
		const left = createAtom(1);
		const right = createAtom(10);
		const result = mount(SelectorPair, { left, right });

		expect(result.find('#pair').textContent).toBe('1/10');
		left.set(2);
		await nextPaint();
		expect(result.find('#pair').textContent).toBe('2/10');
		right.set(15);
		await nextPaint();
		expect(result.find('#pair').textContent).toBe('2/15');
		result.unmount();
	});

	it('uses compare to retain an equivalent selection until it changes', async () => {
		const store = createStore({ visible: 1, ignored: 10 });
		const result = mount(ComparedSelection, { store });

		store.setState({ visible: 1, ignored: 20 });
		await nextPaint();
		expect(result.find('#selection').textContent).toBe('1/10');

		store.setState({ visible: 2, ignored: 20 });
		await nextPaint();
		expect(result.find('#selection').textContent).toBe('2/20');
		result.unmount();
	});

	it('subscribes to readonly derived atoms and stores', async () => {
		const baseAtom = createAtom(2);
		const baseStore = createStore(3);
		const atom = createAtom(() => baseAtom.get() * 2);
		const store = createStore(() => baseStore.state * 3);
		const result = mount(DerivedPair, { atom, store });

		expect(result.find('#derived-pair').textContent).toBe('4/9');
		baseAtom.set(4);
		baseStore.setState(() => 5);
		await nextPaint();
		expect(result.find('#derived-pair').textContent).toBe('8/15');
		result.unmount();
	});

	it('moves its subscription when the source identity changes', async () => {
		const first = createAtom(1);
		const second = createAtom(10);
		const result = mount(SwitchingSource, { first, second });

		result.click('#switch');
		expect(result.find('#switched').textContent).toBe('10');

		first.set(2);
		await nextPaint();
		expect(result.find('#switched').textContent).toBe('10');

		second.set(11);
		await nextPaint();
		expect(result.find('#switched').textContent).toBe('11');
		result.unmount();
	});
});

describe('creation and tuple hooks', () => {
	it('creates stable, independent atoms for distinct call sites', async () => {
		const result = mount(CreatedAtoms);

		result.click('#first-atom');
		await nextPaint();
		expect(result.find('#created-atoms').textContent).toBe('2/10/0');
		result.click('#second-atom');
		await nextPaint();
		expect(result.find('#created-atoms').textContent).toBe('2/15/0');
		result.click('#parent-render');
		expect(result.find('#created-atoms').textContent).toBe('2/15/1');
		result.unmount();
	});

	it('creates plain and action stores and exposes the correct writer', async () => {
		const result = mount(CreatedStores);

		result.click('#plain-store');
		await nextPaint();
		expect(result.find('#created-stores').textContent).toBe('2/10');
		result.click('#action-store');
		await nextPaint();
		expect(result.find('#created-stores').textContent).toBe('2/15');
		result.unmount();
	});

	it('returns a writable atom setter from useAtom', async () => {
		const atom = createAtom(3);
		const result = mount(AtomTuple, { atom });

		result.click('#set-atom');
		await nextPaint();
		expect(result.find('#atom-tuple').textContent).toBe('5');
		expect(atom.get()).toBe(5);
		result.unmount();
	});

	it('keeps the deprecated useStore selector and comparator contract', async () => {
		const store = createStore({ value: 1, meta: 0 });
		const result = mount(LegacyStore, { store });

		store.setState({ value: 1, meta: 1 });
		await nextPaint();
		expect(result.find('#legacy').textContent).toBe('1/0');
		store.setState({ value: 2, meta: 1 });
		await nextPaint();
		expect(result.find('#legacy').textContent).toBe('2/1');
		result.unmount();
	});
});

describe('store context', () => {
	it('uses the nearest provider and keeps nested subscriptions live', async () => {
		const outer = createAtom(1);
		const inner = createAtom(10);
		const result = mount(NestedProviders, { outer, inner });

		expect(result.findAll('.context-value').map((node) => node.textContent)).toEqual(['1', '10']);

		inner.set(11);
		await nextPaint();
		expect(result.findAll('.context-value').map((node) => node.textContent)).toEqual(['1', '11']);
		result.unmount();
	});

	it('throws a clear error outside its provider', () => {
		expect(() => mount(MissingProvider)).toThrowError('Missing StoreProvider for StoreContext');
	});
});

describe('subscription cleanup', () => {
	it('unsubscribes when the consumer unmounts', async () => {
		let liveSubscriptions = 0;
		let value = 1;
		const listeners = new Set<(value: number) => void>();
		const source = {
			get: () => value,
			subscribe(listener: (value: number) => void) {
				liveSubscriptions++;
				listeners.add(listener);
				return {
					unsubscribe() {
						liveSubscriptions--;
						listeners.delete(listener);
					},
				};
			},
		};

		const result = mount(SubscriptionReader, { source });
		await nextPaint();
		expect(result.find('#subscription').textContent).toBe('1');
		expect(liveSubscriptions).toBe(1);

		value = 2;
		for (const listener of listeners) listener(value);
		await nextPaint();
		expect(result.find('#subscription').textContent).toBe('2');

		result.unmount();
		await nextPaint();
		expect(liveSubscriptions).toBe(0);
	});
});
