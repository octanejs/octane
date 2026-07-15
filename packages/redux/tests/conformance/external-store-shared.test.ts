import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../_helpers.js';
import {
	ChangingSelectorReader,
	EqualityErrorBoundary,
	EqualityPair,
	SelectedValueReader,
	SelectorErrorBoundary,
	createExternalStore,
} from '../_fixtures/external-store-shared.tsrx';

function updateStore(run: () => void): void {
	flushSync(run);
	flushEffects();
}

describe('useSyncExternalStoreWithSelector shared behavior', () => {
	// Regression discovered while adapting useSyncExternalStoreShared-test.js:682:
	// compiled calls without isEqual must not mistake the trailing hook slot for it.
	it('updates selected output when the optional equality function is omitted', () => {
		const store = createExternalStore({ a: 0, b: 0 });
		const root = mount(SelectedValueReader, { store });
		flushEffects();
		expect(root.find('#selected-value').textContent).toBe('0');

		updateStore(() => store.set({ a: 1, b: 0 }));
		expect(root.find('#selected-value').textContent).toBe('1');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:726 (stable), :730 (canary).
	it('Using isEqual to bailout', () => {
		const store = createExternalStore({ a: 0, b: 0 });
		const aProbe = { value: '' };
		const bProbe = { value: '' };
		const root = mount(EqualityPair, { store, aProbe, bProbe });
		flushEffects();
		expect(root.find('#equality-a').textContent).toBe('A0');
		expect(root.find('#equality-b').textContent).toBe('B0');
		expect(aProbe.value).toBe('A0');
		expect(bProbe.value).toBe('B0');

		aProbe.value = 'untouched';
		bProbe.value = 'untouched';
		updateStore(() => store.set({ a: 0, b: 1 }));
		expect(root.find('#equality-a').textContent).toBe('A0');
		expect(root.find('#equality-b').textContent).toBe('B1');
		expect(aProbe.value).toBe('untouched');
		expect(bProbe.value).toBe('B1');

		aProbe.value = 'untouched';
		bProbe.value = 'untouched';
		updateStore(() => store.set({ a: 1, b: 1 }));
		expect(root.find('#equality-a').textContent).toBe('A1');
		expect(root.find('#equality-b').textContent).toBe('B1');
		expect(aProbe.value).toBe('A1');
		expect(bProbe.value).toBe('untouched');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:873 (stable), :882 (canary).
	it('compares selection to rendered selection even if selector changes', () => {
		const store = createExternalStore({ items: ['A', 'B'] });
		const selectionProbe = { value: '' };
		const root = mount(ChangingSelectorReader, { store, step: 0, selectionProbe });
		flushEffects();
		expect(root.find('#changing-selection').textContent).toBe('A,B,C|selected:0');
		expect(selectionProbe.value).toBe('A,B,C|selected:0');

		selectionProbe.value = 'untouched';
		root.update(ChangingSelectorReader, { store, step: 1, selectionProbe });
		flushEffects();
		// isEqual treats the fresh inline selector's items as the same selection, so
		// the previous selection remains visible and its dependent effect stays quiet.
		expect(root.find('#changing-selection').textContent).toBe('A,B,C|selected:0');
		expect(selectionProbe.value).toBe('untouched');
		expect(root.find('#changing-selector-step').textContent).toBe('1');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:980 (stable), :989 (canary). React's
	// class ErrorBoundary is adapted to Octane's function-component @try/@catch.
	it('selector can throw on update', () => {
		const store = createExternalStore({ a: 'a' });
		const root = mount(SelectorErrorBoundary, { store });
		flushEffects();
		expect(root.find('#selector-value').textContent).toBe('A');

		updateStore(() => store.set({}));
		expect(root.find('#selector-error').textContent).toBe('Malformed state');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:1028 (stable), :1037 (canary). React's
	// class ErrorBoundary is adapted to Octane's function-component @try/@catch.
	it('isEqual can throw on update', () => {
		const store = createExternalStore({ a: 'A' });
		const root = mount(EqualityErrorBoundary, { store });
		flushEffects();
		expect(root.find('#equality-value').textContent).toBe('A');

		updateStore(() => store.set({}));
		expect(root.find('#equality-error').textContent).toBe('Malformed state');
		root.unmount();
	});
});
