import type { RegistryStoreOptions, StoreRegistry } from '@livestore/livestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetUseRcResourceCache } from '../src/useRcResource';
import { act, flushEffects, mount, nextPaint } from './_helpers';
import {
	ResourceReader,
	SuspenseStoreReader,
	SuspenseStoreWithActionState,
	TwoResourceReaders,
	augmentStore,
} from './_fixtures/lifecycle.tsrx';

beforeEach(function resetResourceCache() {
	__resetUseRcResourceCache();
});

describe('reference-counted resources', () => {
	// Per upstream/src/useRcResource.test.tsx:14.
	it('should create a stateful entity using make and call cleanup on unmount', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const scope = {};
		const result = mount(ResourceReader, { scope, resourceKey: 'key-1', create, dispose });
		flushEffects();
		expect(result.find('.resource').textContent).toBe('1');
		expect(create).toHaveBeenCalledTimes(1);
		expect(dispose).not.toHaveBeenCalled();
		result.unmount();
		flushEffects();
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	// Per upstream/src/useRcResource.test.tsx:31.
	it('should reuse the same entity when the key remains unchanged', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const scope = {};
		const result = mount(ResourceReader, { scope, resourceKey: 'stable', create, dispose });
		flushEffects();
		result.update(ResourceReader, { scope, resourceKey: 'stable', create, dispose });
		expect(result.find('.resource').textContent).toBe('1');
		expect(create).toHaveBeenCalledTimes(1);
		result.unmount();
		flushEffects();
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	// Per upstream/src/useRcResource.test.tsx:54.
	it('should dispose the previous instance when the key changes', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const scope = {};
		const result = mount(ResourceReader, { scope, resourceKey: 'a', create, dispose });
		flushEffects();
		result.update(ResourceReader, { scope, resourceKey: 'b', create, dispose });
		flushEffects();
		expect(result.find('.resource').textContent).toBe('2');
		expect(create).toHaveBeenCalledTimes(2);
		expect(dispose).toHaveBeenCalledTimes(1);
		result.unmount();
		flushEffects();
		expect(dispose).toHaveBeenCalledTimes(2);
	});

	// Per upstream/src/useRcResource.test.tsx:78.
	it('should not dispose the entity until all consumers unmount', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const scope = {};
		const result = mount(TwoResourceReaders, { scope, showSecond: true, create, dispose });
		flushEffects();
		expect(result.findAll('.resource').map((node) => node.textContent)).toEqual(['1', '1']);
		result.update(TwoResourceReaders, { scope, showSecond: false, create, dispose });
		expect(dispose).not.toHaveBeenCalled();
		result.unmount();
		flushEffects();
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	// Per upstream/src/useRcResource.test.tsx:105.
	it('should handle rapid key changes correctly', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const scope = {};
		const result = mount(ResourceReader, { scope, resourceKey: '1', create, dispose });
		flushEffects();
		result.update(ResourceReader, { scope, resourceKey: '2', create, dispose });
		flushEffects();
		result.update(ResourceReader, { scope, resourceKey: '3', create, dispose });
		flushEffects();
		expect(result.find('.resource').textContent).toBe('3');
		expect(create).toHaveBeenCalledTimes(3);
		expect(dispose).toHaveBeenCalledTimes(2);
		result.unmount();
		flushEffects();
		expect(dispose).toHaveBeenCalledTimes(3);
	});

	// Per upstream/src/useRcResource.test.tsx:129.
	it('should isolate entities created with the same key but different scopes', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const first = mount(ResourceReader, { scope: {}, resourceKey: 'shared', create, dispose });
		const second = mount(ResourceReader, { scope: {}, resourceKey: 'shared', create, dispose });
		flushEffects();
		expect(first.find('.resource').textContent).toBe('1');
		expect(second.find('.resource').textContent).toBe('2');
		expect(create).toHaveBeenCalledTimes(2);
		first.unmount();
		second.unmount();
		flushEffects();
	});

	// Per upstream/src/useRcResource.test.tsx:148.
	it('should dispose the previous entity when the scope changes (key unchanged)', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const scopeA = {};
		const scopeB = {};
		const result = mount(ResourceReader, { scope: scopeA, resourceKey: 'k', create, dispose });
		flushEffects();
		result.update(ResourceReader, { scope: scopeB, resourceKey: 'k', create, dispose });
		flushEffects();
		expect(result.find('.resource').textContent).toBe('2');
		expect(dispose).toHaveBeenCalledTimes(1);
		result.unmount();
		flushEffects();
		expect(dispose).toHaveBeenCalledTimes(2);
	});

	// Per upstream/src/useRcResource.test.tsx:174.
	it('should not reuse a cached entity after the scope is replaced', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const first = mount(ResourceReader, { scope: {}, resourceKey: 'k', create, dispose });
		flushEffects();
		expect(first.find('.resource').textContent).toBe('1');
		first.unmount();
		flushEffects();
		const second = mount(ResourceReader, { scope: {}, resourceKey: 'k', create, dispose });
		flushEffects();
		expect(second.find('.resource').textContent).toBe('2');
		second.unmount();
		flushEffects();
	});

	// Per upstream/src/useRcResource.test.tsx:201.
	it('should share the entity across components within the same scope', () => {
		let nextId = 0;
		const create = vi.fn(() => ({ id: ++nextId }));
		const dispose = vi.fn();
		const scope = {};
		const first = mount(ResourceReader, { scope, resourceKey: 'k', create, dispose });
		const second = mount(ResourceReader, { scope, resourceKey: 'k', create, dispose });
		flushEffects();
		expect(first.find('.resource').textContent).toBe('1');
		expect(second.find('.resource').textContent).toBe('1');
		first.unmount();
		flushEffects();
		expect(dispose).not.toHaveBeenCalled();
		second.unmount();
		flushEffects();
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});

describe('registry and store lifecycle', () => {
	// Per upstream/src/useStore.test.tsx:40.
	it('works with Suspense boundary', async () => {
		let resolve!: (store: object) => void;
		const promise = new Promise<object>((done) => {
			resolve = done;
		});
		const release = vi.fn();
		const options = { storeId: 'test' } as RegistryStoreOptions<any>;
		const store = { id: 'ready' };
		const registry = {
			getOrLoadPromise: vi.fn(() => promise),
			retain: vi.fn(() => release),
		} as unknown as StoreRegistry;
		const result = mount(SuspenseStoreReader, { registry, options });

		expect(result.find('#fallback').textContent).toBe('loading');
		expect(registry.retain).not.toHaveBeenCalled();
		await act(() => {
			resolve(store);
			(registry.getOrLoadPromise as ReturnType<typeof vi.fn>).mockReturnValue(store);
		});
		expect(result.findAll('#fallback')).toHaveLength(0);
		expect(result.find('#store').textContent).toBe('ready');

		flushEffects();
		expect(registry.retain).toHaveBeenCalledWith(options);
		expect(augmentStore(store)).toBe(store);
		expect(store).toHaveProperty('useQuery');
		expect(store).toHaveProperty('useClientDocument');
		expect(store).toHaveProperty('useSyncStatus');

		result.unmount();
		flushEffects();
		expect(release).toHaveBeenCalledTimes(1);
	});

	// Per upstream/src/useStore.test.tsx:63.
	it('does not re-suspend on subsequent renders when store is already loaded', () => {
		const release = vi.fn();
		const store = { id: 'ready' };
		const registry = {
			getOrLoadPromise: vi.fn(() => store),
			retain: vi.fn(() => release),
		} as unknown as StoreRegistry;
		const options = { storeId: 'stable' } as RegistryStoreOptions<any>;
		const result = mount(SuspenseStoreReader, { registry, options });
		flushEffects();
		expect(result.find('#store').textContent).toBe('ready');

		result.update(SuspenseStoreReader, { registry, options: { ...options } });
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#store').textContent).toBe('ready');
		result.unmount();
		flushEffects();
	});

	// Per upstream/src/useStore.test.tsx:97.
	it('throws when store loading fails', () => {
		const failure = new Error('store load failed');
		const registry = {
			getOrLoadPromise: vi.fn(() => {
				throw failure;
			}),
		} as unknown as StoreRegistry;
		const options = { storeId: 'broken' } as RegistryStoreOptions<any>;
		expect(() => mount(SuspenseStoreReader, { registry, options })).toThrow(failure);
	});

	// Per upstream/src/useStore.test.tsx:138.
	it('handles switching between different storeId values', () => {
		const stores = new Map([
			['store-a', { id: 'store-a' }],
			['store-b', { id: 'store-b' }],
		]);
		const registry = {
			getOrLoadPromise: vi.fn(function loadByStoreId(options: RegistryStoreOptions<any>) {
				return stores.get(options.storeId);
			}),
			retain: vi.fn(function retainStore() {
				return vi.fn();
			}),
		} as unknown as StoreRegistry;
		const optionsA = { storeId: 'store-a' } as RegistryStoreOptions<any>;
		const optionsB = { storeId: 'store-b' } as RegistryStoreOptions<any>;
		const result = mount(SuspenseStoreReader, { registry, options: optionsA });
		flushEffects();
		expect(result.find('#store').textContent).toBe('store-a');
		result.update(SuspenseStoreReader, { registry, options: optionsB });
		expect(result.find('#store').textContent).toBe('store-b');
		result.unmount();
		flushEffects();
	});

	// Per upstream/src/useStore.test.tsx:176.
	it('does not block useActionState transitions from committing', async () => {
		const release = vi.fn();
		const store = { id: 'ready' };
		const getOrLoadPromise = vi.fn(function loadStore() {
			return store;
		});
		const registry = {
			getOrLoadPromise,
			retain: vi.fn(function retainStore() {
				return release;
			}),
		} as unknown as StoreRegistry;
		const options = { storeId: 'action-state' } as RegistryStoreOptions<any>;
		const result = mount(SuspenseStoreWithActionState, { registry, options });
		flushEffects();
		expect(result.find('#state').textContent).toBe('none');
		expect(result.find('#pending').textContent).toBe('false');

		// After store is loaded, clear spy to only track calls during the transition render.
		getOrLoadPromise.mockClear();

		await act(function triggerActionState() {
			result.click('#submit');
		});

		// getOrLoadPromise must be called on each render (not cached via useMemo).
		// When the initial Promise is cached, use() is called with a resolved Promise
		// on every subsequent render, which blocks transitions (e.g. useActionState)
		// from ever committing.
		expect(getOrLoadPromise).toHaveBeenCalled();

		await nextPaint();
		expect(result.find('#state').textContent).toBe('updated');
		expect(result.find('#pending').textContent).toBe('false');

		result.unmount();
		flushEffects();
		expect(release).toHaveBeenCalledTimes(1);
	});
});
