import { makeInMemoryAdapter } from '@livestore/adapter-web';
import { schema } from '@livestore/framework-toolkit/testing';
import { type RegistryStoreOptions, StoreRegistry, storeOptions } from '@livestore/livestore';
import { startTransition } from 'octane';
import { describe, expect, it } from 'vitest';
import { act, createLog, flushEffects, mount } from '../_helpers';
import { SuspenseStoreWithActionState, SuspenseTwoStoreReader } from '../_fixtures/lifecycle.tsrx';

type FakeStore = { storeId: string };

/**
 * Mirrors `StoreRegistry.getOrLoadPromise`: one stable Promise per storeId
 * while loading, then the Store itself, synchronously, once loaded. Each
 * store settles only when the test says so.
 */
function controlledRegistry() {
	const loads = new Map<
		string,
		{ promise: Promise<FakeStore>; resolve: (store: FakeStore) => void; store?: FakeStore }
	>();
	function load(storeId: string) {
		let entry = loads.get(storeId);
		if (entry === undefined) {
			let resolve!: (store: FakeStore) => void;
			const promise = new Promise<FakeStore>(function capture(done) {
				resolve = done;
			});
			entry = { promise, resolve };
			loads.set(storeId, entry);
		}
		return entry;
	}
	const registry = {
		getOrLoadPromise(options: RegistryStoreOptions<any>) {
			const entry = load(options.storeId);
			return entry.store ?? entry.promise;
		},
		retain() {
			return function release() {};
		},
	} as unknown as StoreRegistry;
	function settle(storeId: string) {
		const entry = load(storeId);
		entry.store = { storeId };
		entry.resolve(entry.store);
	}
	return { registry, settle };
}

function optionsFor(storeId: string) {
	return { storeId } as RegistryStoreOptions<any>;
}

/** Renders where a useStore() call received a store other than its own. */
function mismatchedRenders(rendered: string[], ...valid: string[]) {
	return rendered.filter(function isMismatched(ids) {
		return !valid.includes(ids);
	});
}

describe('sequential useStore calls in one component', () => {
	it('keeps the fallback until both stores load and returns each call its own store', async () => {
		const { registry, settle } = controlledRegistry();
		const log = createLog();
		const result = mount(SuspenseTwoStoreReader, {
			registry,
			first: optionsFor('a'),
			second: optionsFor('b'),
			log: log.push,
		});
		expect(result.find('#fallback').textContent).toBe('loading');

		// The first store loads while the second is still loading: the replay
		// reaches the second useStore for the first time and must suspend on it.
		await act(function settleFirst() {
			settle('a');
		});
		expect(result.findAll('#stores')).toHaveLength(0);
		expect(result.find('#fallback').textContent).toBe('loading');

		await act(function settleSecond() {
			settle('b');
		});
		expect(result.findAll('#fallback')).toHaveLength(0);
		expect(result.find('#stores').textContent).toBe('a|b');
		expect(mismatchedRenders(log.drain(), 'a|b')).toEqual([]);
		result.unmount();
		flushEffects();
	});

	it('holds a transition to two unloaded stores until both load', async () => {
		const { registry, settle } = controlledRegistry();
		settle('a0');
		settle('b0');
		const log = createLog();
		const props = { registry, first: optionsFor('a0'), second: optionsFor('b0'), log: log.push };
		const result = mount(SuspenseTwoStoreReader, props);
		expect(result.find('#stores').textContent).toBe('a0|b0');
		log.clear();

		await act(function switchStores() {
			startTransition(function render() {
				result.root.render(SuspenseTwoStoreReader, {
					...props,
					first: optionsFor('a1'),
					second: optionsFor('b1'),
				});
			});
		});
		expect(result.find('#stores').textContent).toBe('a0|b0');

		await act(function settleFirst() {
			settle('a1');
		});
		expect(result.findAll('#fallback')).toHaveLength(0);
		expect(result.find('#stores').textContent).toBe('a0|b0');

		await act(function settleSecond() {
			settle('b1');
		});
		expect(result.find('#stores').textContent).toBe('a1|b1');
		expect(mismatchedRenders(log.drain(), 'a0|b0', 'a1|b1')).toEqual([]);
		result.unmount();
		flushEffects();
	});

	// Upstream calls getOrLoadPromise on every render so React.use() never sees a
	// resolved promise, which blocked React transitions. A call site that
	// suspended keeps reading its settled promise here, so transitions must still
	// commit after the store loads through Suspense.
	it('commits useActionState transitions after the store loads through Suspense', async () => {
		const { registry, settle } = controlledRegistry();
		const options = optionsFor('action-state');
		const result = mount(SuspenseStoreWithActionState, { registry, options });
		expect(result.find('#fallback').textContent).toBe('loading');
		await act(function settleStore() {
			settle('action-state');
		});
		expect(result.find('#state').textContent).toBe('none');

		await act(function submit() {
			result.click('#submit');
		});
		flushEffects();
		expect(result.find('#state').textContent).toBe('updated');
		expect(result.find('#pending').textContent).toBe('false');
		result.unmount();
		flushEffects();
	});

	it('returns each call its own store from a real StoreRegistry', async () => {
		const registry = new StoreRegistry();
		const first = storeOptions({ storeId: 'sequential-a', schema, adapter: makeInMemoryAdapter() });
		const second = storeOptions({
			storeId: 'sequential-b',
			schema,
			adapter: makeInMemoryAdapter(),
		});
		const log = createLog();
		const result = mount(SuspenseTwoStoreReader, { registry, first, second, log: log.push });
		expect(result.find('#fallback').textContent).toBe('loading');

		for (let attempt = 0; attempt < 100 && result.findAll('#stores').length === 0; attempt++) {
			await act(function waitForStores() {
				return new Promise<void>(function tick(done) {
					setTimeout(done, 10);
				});
			});
		}
		expect(result.find('#stores').textContent).toBe('sequential-a|sequential-b');
		expect(mismatchedRenders(log.drain(), 'sequential-a|sequential-b')).toEqual([]);
		result.unmount();
		flushEffects();
		await registry.dispose();
	});
});
