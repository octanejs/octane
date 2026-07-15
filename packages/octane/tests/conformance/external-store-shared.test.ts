import { afterEach, describe, expect, it } from 'vitest';
import { act, createRoot, drainPassiveEffects, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRuntime from 'octane/server';
import { flushEffects, mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	BasicReader,
	DerivedSnapshotReader,
	HydrationStoreReader,
	LatestSnapshotReader,
	NumberSnapshotReader,
	ResetDuringCommit,
	SelectedPair,
	SelectionChangeDuringCommit,
	SnapshotErrorBoundary,
	StableSelectionDuringCommit,
	SwappableReader,
	UncachedSnapshotReader,
	controls,
	createExternalStore,
} from './_fixtures/external-store-shared.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/external-store-shared.tsrx';
const server = loadServerFixture(FIXTURE);
const looseContainers: HTMLElement[] = [];

afterEach(() => {
	for (const container of looseContainers.splice(0)) container.remove();
	controls.setStore = null;
	controls.setStep = null;
	controls.setGetSnapshot = null;
});

function flushStoreUpdate(run: () => void): void {
	flushSync(run);
	flushEffects();
}

describe('Shared useSyncExternalStore behavior', () => {
	// Per useSyncExternalStoreShared-test.js:133 (stable and canary).
	it('basic usage', () => {
		const store = createExternalStore('Initial');
		const root = mount(BasicReader, { store });
		flushEffects();
		expect(root.find('#basic-store-value').textContent).toBe('Initial');
		expect(store.getSubscriberCount()).toBe(1);

		flushStoreUpdate(() => store.set('Updated'));
		expect(root.find('#basic-store-value').textContent).toBe('Updated');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:152 (stable and canary).
	it('skips re-rendering if nothing changes', () => {
		const store = createExternalStore('Initial');
		const commitProbe = { value: '' };
		const root = mount(BasicReader, { store, commitProbe });
		flushEffects();
		expect(commitProbe.value).toBe('Initial');

		commitProbe.value = 'untouched';
		flushStoreUpdate(() => store.set('Initial'));
		// The Object.is-equal snapshot does not commit another render: an explicit
		// every-render layout probe remains untouched.
		expect(commitProbe.value).toBe('untouched');
		expect(root.find('#basic-store-value').textContent).toBe('Initial');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:174 (stable and canary).
	it('switch to a different store', () => {
		const storeA = createExternalStore(0);
		const storeB = createExternalStore(0);
		const root = mount(SwappableReader, { store: storeA });
		flushEffects();

		flushStoreUpdate(() => storeA.set(1));
		expect(root.find('#swappable-store-value').textContent).toBe('1');

		flushStoreUpdate(() => {
			storeA.set(2);
			controls.setStore(storeB);
		});
		expect(root.find('#swappable-store-value').textContent).toBe('0');
		expect(storeA.getSubscriberCount()).toBe(0);
		expect(storeB.getSubscriberCount()).toBe(1);

		flushStoreUpdate(() => storeA.set(3));
		expect(root.find('#swappable-store-value').textContent).toBe('0');
		flushStoreUpdate(() => storeB.set(1));
		expect(root.find('#swappable-store-value').textContent).toBe('1');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:224 (stable and canary).
	it('selecting a specific value inside getSnapshot', () => {
		const store = createExternalStore({ a: 0, b: 0 });
		const aProbe = { value: '' };
		const bProbe = { value: '' };
		const root = mount(SelectedPair, { store, aProbe, bProbe });
		flushEffects();
		expect(aProbe.value).toBe('A0');
		expect(bProbe.value).toBe('B0');

		aProbe.value = 'untouched';
		bProbe.value = 'untouched';
		flushStoreUpdate(() => store.set({ a: 0, b: 1 }));
		expect(root.container.textContent).toBe('A0B1');
		expect(aProbe.value).toBe('untouched');
		expect(bProbe.value).toBe('B1');

		aProbe.value = 'untouched';
		bProbe.value = 'untouched';
		flushStoreUpdate(() => store.set({ a: 1, b: 1 }));
		expect(root.container.textContent).toBe('A1B1');
		expect(aProbe.value).toBe('A1');
		expect(bProbe.value).toBe('untouched');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:324 (stable and canary).
	it('mutating the store in between render and commit when getSnapshot has changed', () => {
		const store = createExternalStore({ a: 1, b: 1 });
		const getSnapshotA = () => store.getState().a;
		const getSnapshotB = () => store.getState().b;
		const root = mount(SelectionChangeDuringCommit, {
			store,
			getSnapshotA,
			getSnapshotB,
		});
		flushEffects();
		expect(root.find('#commit-selection').textContent).toBe('A1');

		flushSync(() => controls.setStep(1));
		expect(root.find('#commit-selection').textContent).toBe('B2');
		expect(store.getState()).toEqual({ a: 1, b: 2 });
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:389 (stable and canary).
	it('mutating the store in between render and commit when getSnapshot has _not_ changed', () => {
		const store = createExternalStore({ a: 1, b: 1 });
		const getSnapshotA = () => store.getState().a;
		const commitProbe = { lastStep: null as number | null, repeatedStep: null as number | null };
		const root = mount(StableSelectionDuringCommit, {
			store,
			getSnapshotA,
			commitProbe,
		});
		flushEffects();
		expect(root.find('#stable-commit-selection').textContent).toBe('A1');
		expect(commitProbe).toEqual({ lastStep: 0, repeatedStep: null });

		flushSync(() => controls.setStep(1));
		expect(root.find('#stable-commit-selection').textContent).toBe('A1');
		expect(store.getState()).toEqual({ a: 1, b: 2 });
		// The parent step causes one required commit. Since B changed but the selected
		// A snapshot did not, the store notification must not cause a second step-1 commit.
		expect(commitProbe).toEqual({ lastStep: 1, repeatedStep: null });
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:454 (stable and canary).
	it("does not bail out if the previous update hasn't finished yet", () => {
		const store = createExternalStore(0);
		const root = mount(ResetDuringCommit, { store });
		flushEffects();
		expect(root.find('#reset-pair').textContent).toBe('00');

		flushSync(() => store.set(1));
		expect(root.find('#reset-pair').textContent).toBe('00');
		expect(store.getState()).toBe(0);
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:494 (stable and canary).
	it('uses the latest getSnapshot, even if it changed in the same batch as a store update', () => {
		const store = createExternalStore({ a: 0, b: 0 });
		const getSnapshotA = () => store.getState().a;
		const getSnapshotB = () => store.getState().b;
		const root = mount(LatestSnapshotReader, { store, getSnapshotA });
		flushEffects();
		expect(root.find('#latest-snapshot').textContent).toBe('0');

		flushStoreUpdate(() => {
			controls.setGetSnapshot(() => getSnapshotB);
			store.set({ a: 1, b: 2 });
		});
		expect(root.find('#latest-snapshot').textContent).toBe('2');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:529 (stable and canary). React's
	// class ErrorBoundary is adapted to Octane's function-component @try/@catch.
	it('handles errors thrown by getSnapshot', () => {
		const store = createExternalStore({ value: 0, throwInGetSnapshot: false });
		const root = mount(SnapshotErrorBoundary, { store });
		flushEffects();
		expect(root.find('#throwing-snapshot-value').textContent).toBe('0');

		flushStoreUpdate(() => store.set({ value: 1, throwInGetSnapshot: true }));
		expect(root.find('#snapshot-error').textContent).toBe('Error in getSnapshot');
		expect(store.getSubscriberCount()).toBe(0);
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:615 (stable and canary).
	it('Infinite loop if getSnapshot keeps returning new reference', async () => {
		const store = createExternalStore({});
		const container = document.createElement('div');
		document.body.appendChild(container);
		looseContainers.push(container);
		const root = createRoot(container);

		await expect(async () => {
			await act(() => root.render(UncachedSnapshotReader, { store }));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:652 (stable), :656 (canary).
	it('getSnapshot can return NaN without infinite loop warning', () => {
		const store = createExternalStore('not a number');
		const root = mount(NumberSnapshotReader, { store });
		flushEffects();
		expect(root.find('#number-snapshot').textContent).toBe('NaN');

		flushStoreUpdate(() => store.set(123));
		expect(root.find('#number-snapshot').textContent).toBe('123');
		flushStoreUpdate(() => store.set('not a number'));
		expect(root.find('#number-snapshot').textContent).toBe('NaN');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:797 (stable), :801 (canary).
	it('basic server hydration', () => {
		const store = {
			...createExternalStore('client'),
			getServerState: () => 'server',
		};
		const { html } = ServerRuntime.renderToString(server.HydrationStoreReader, {
			store,
			hostRef: null,
		});
		expect(html).toBe('<div id="hydrated-store">server</div>');

		const container = document.createElement('div');
		document.body.appendChild(container);
		looseContainers.push(container);
		container.innerHTML = html;
		const serverNode = container.firstElementChild;
		const hostRef = { current: null as Element | null };
		const root = hydrateRoot(container, HydrationStoreReader, { store, hostRef });
		expect(container.firstElementChild).toBe(serverNode);
		expect(container.textContent).toBe('server');

		flushSync(() => {});
		drainPassiveEffects();
		flushSync(() => {});
		expect(container.firstElementChild).toBe(serverNode);
		expect(hostRef.current).toBe(serverNode);
		expect(container.textContent).toBe('client');
		root.unmount();
	});

	// Per useSyncExternalStoreShared-test.js:849 (stable), :858 (canary).
	it('regression test for #23150', () => {
		const store = createExternalStore('Initial');
		const root = mount(DerivedSnapshotReader, { store });
		flushEffects();
		expect(root.find('#derived-snapshot').textContent).toBe('INITIAL');

		flushStoreUpdate(() => store.set('Updated'));
		expect(root.find('#derived-snapshot').textContent).toBe('UPDATED');
		root.unmount();
	});
});
