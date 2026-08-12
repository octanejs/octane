import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { cache } from '../../../src/_internal/index';
import {
	controls,
	ImmutableReader,
	InfiniteReader,
	MutationReader,
	SubscriptionReader,
	SubscriptionSiblings,
} from './fixtures.tsrx';

// Cases adapted from the pinned SWR 2.4.2 suite under `packages/swr/upstream/test/`.
// Each `it` cites the upstream file and case it adapts and asserts Octane's observable
// outcome rather than React internals.

let container: HTMLElement;
let root: ReturnType<typeof createRoot> | undefined;

function mount(Component: unknown, props: object) {
	container = document.createElement('div');
	root = createRoot(container);
	root.render(Component as never, props);
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

async function settle(turns = 8) {
	for (let index = 0; index < turns; index++) {
		await Promise.resolve();
		flushSync(() => {});
		drainPassiveEffects();
	}
}

function value(id: string) {
	return JSON.parse(container.querySelector(`[data-testid="${id}"]`)!.textContent!);
}

afterEach(() => {
	root?.unmount();
	root = undefined;
	for (const key of [...cache.keys()]) cache.delete(key);
	for (const key of Object.keys(controls)) delete controls[key];
});

describe('SWR U4 specialized entrypoints', () => {
	// Per use-swr-immutable.test.tsx:104 — 'should not revalidate with the immutable hook'.
	it('keeps immutable data stable across focus events', async () => {
		const fetcher = vi.fn(async () => 'immutable');
		mount(ImmutableReader, {
			cacheKey: 'immutable-key',
			fetcher,
			config: { dedupingInterval: 0, focusThrottleInterval: 0 },
		});
		await settle();
		window.dispatchEvent(new Event('focus'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		await settle();
		expect(fetcher).toHaveBeenCalledOnce();
		expect(value('immutable').data).toBe('immutable');
	});

	// Per use-swr-infinite.test.tsx:76 — 'should render the multiple pages'.
	it('loads infinite pages sequentially and grows with setSize', async () => {
		const fetcher = vi.fn(async ([, index]) => `page-${index}`);
		const getKey = (index: number) => (index < 3 ? ['page', index] : null);
		mount(InfiniteReader, { getKey, fetcher, config: { initialSize: 1 } });
		await settle();
		expect(value('infinite')).toMatchObject({ data: ['page-0'], size: 1 });
		await controls.setSize(3);
		await settle(12);
		expect(value('infinite')).toMatchObject({
			data: ['page-0', 'page-1', 'page-2'],
			size: 3,
		});
		// Growing revalidates the first page by default, then fetches pages 2 and 3.
		expect(fetcher).toHaveBeenCalledTimes(4);
	});

	// Per use-swr-infinite.test.tsx:1819 — 'should make previousPageData null when the parallel
	// option is enabled'.
	it('passes null previous-page data in parallel infinite mode', async () => {
		const previous: unknown[] = [];
		const getKey = (index: number, previousPageData: unknown) => {
			previous.push(previousPageData);
			return index < 2 ? ['parallel', index] : null;
		};
		const fetcher = vi.fn(async ([, index]) => `parallel-${index}`);
		mount(InfiniteReader, {
			getKey,
			fetcher,
			config: { initialSize: 2, parallel: true },
		});
		await settle(12);
		expect(value('infinite').data).toEqual(['parallel-0', 'parallel-1']);
		expect(previous.every((item) => item === null)).toBe(true);
	});

	// Per use-swr-remote-mutation.test.tsx:10 — 'should return data after triggering'.
	// Per use-swr-remote-mutation.test.tsx:734 — 'should be able to reset the state'.
	it('tracks remote mutation trigger success and reset', async () => {
		const fetcher = vi.fn(async (_key, { arg }) => `saved-${arg}`);
		mount(MutationReader, { cacheKey: 'mutation-key', fetcher });
		const pending = controls.trigger('value');
		flushSync(() => {});
		expect(value('mutation').isMutating).toBe(true);
		await expect(pending).resolves.toBe('saved-value');
		await settle();
		expect(value('mutation')).toMatchObject({ data: 'saved-value', isMutating: false });
		controls.reset();
		flushSync(() => {});
		expect(value('mutation')).toEqual({ isMutating: false });
	});

	// Per use-swr-remote-mutation.test.tsx:802 — 'should prevent race condition if triggered
	// multiple times'.
	it('keeps only the latest remote mutation result and callback', async () => {
		const resolvers: ((value: string) => void)[] = [];
		const successes: string[] = [];
		const fetcher = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));
		mount(MutationReader, {
			cacheKey: 'mutation-race',
			fetcher,
			config: { onSuccess: (data: string) => successes.push(data) },
		});
		const older = controls.trigger('older');
		const newer = controls.trigger('newer');
		resolvers[1]('newer-result');
		await newer;
		await settle();
		resolvers[0]('older-result');
		await older;
		await settle();
		expect(value('mutation').data).toBe('newer-result');
		expect(successes).toEqual(['newer-result']);
	});

	// Per use-swr-remote-mutation.test.tsx:134 — 'should call `onError` event and throw'.
	it('surfaces remote mutation failures and honors throwOnError', async () => {
		const error = new Error('mutation failed');
		const onError = vi.fn();
		mount(MutationReader, {
			cacheKey: 'mutation-error',
			fetcher: async () => {
				throw error;
			},
			config: { onError },
		});
		await expect(controls.trigger()).rejects.toThrow('mutation failed');
		await settle();
		expect(value('mutation').error).toBe('mutation failed');
		expect(onError).toHaveBeenCalledOnce();
	});

	// Per use-swr-subscription.test.tsx:159 — 'should deduplicate subscriptions'.
	it('shares one subscription setup and disposes it after the final consumer', async () => {
		let next!: (error?: Error, data?: string) => void;
		const dispose = vi.fn();
		const subscribe = vi.fn((_key, options) => {
			next = options.next;
			return dispose;
		});
		mount(SubscriptionSiblings, { cacheKey: 'subscription-key', subscribe });
		await settle();
		expect(subscribe).toHaveBeenCalledOnce();
		next(undefined, 'event');
		await settle();
		expect(value('subscription-first').data).toBe('event');
		expect(value('subscription-second').data).toBe('event');
		root!.unmount();
		root = undefined;
		drainPassiveEffects();
		expect(dispose).toHaveBeenCalledOnce();
	});

	// Per use-swr-subscription.test.tsx:9 — 'should update the state' (error branch via next(err)).
	it('surfaces subscription errors', async () => {
		let next!: (error?: Error, data?: string) => void;
		mount(SubscriptionReader, {
			cacheKey: 'subscription-error',
			subscribe: (_key: string, options: { next: (error?: Error, data?: string) => void }) => {
				next = options.next;
				return () => undefined;
			},
		});
		next(new Error('subscription failed'));
		await settle();
		expect(value('subscription').error).toBe('subscription failed');
	});

	// Per use-swr-subscription.test.tsx:296 — 'should require a dispose function'.
	it('rejects an invalid subscription disposer', () => {
		const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mount(SubscriptionReader, {
			cacheKey: 'subscription-invalid',
			subscribe: () => undefined,
		});
		expect(report).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining('must return a function'),
			}),
		);
		report.mockRestore();
	});
});
