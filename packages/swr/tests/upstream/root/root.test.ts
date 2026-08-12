import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import * as Octane from 'octane';
import { cache, mutate } from '../../../src/_internal/index';
import { setupDevTools } from '../../../src/_internal/utils/devtools';
import { captured, SWRReader, SWRSiblings, SWRSuspense } from './fixtures.tsrx';

// Cases adapted from the pinned SWR 2.4.2 suite under `packages/swr/upstream/test/`.
// Each `it` cites the upstream file and case it adapts and asserts Octane's observable
// outcome. Octane-only provider slot wiring lives in `tests/unit/`, not here.

let container: HTMLElement;
let root: ReturnType<typeof createRoot> | undefined;

function mount(Component: unknown, props: object) {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	root.render(Component as never, props);
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

async function settle(turns = 6) {
	for (let index = 0; index < turns; index++) {
		await Promise.resolve();
		flushSync(() => {});
		drainPassiveEffects();
	}
}

async function settleTimers(turns = 4) {
	for (let index = 0; index < turns; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await settle(2);
	}
}

function value(id = 'value') {
	return JSON.parse(container.querySelector(`[data-testid="${id}"]`)!.textContent!);
}

afterEach(() => {
	root?.unmount();
	container?.remove();
	cache.clear();
});

describe('SWR U3 root lifecycle', () => {
	// Per use-swr-loading.test.tsx:37 — 'should return loading state'.
	// Per use-swr-loading.test.tsx:14 — 'should return validating state'.
	it('publishes loading, data, and validation state around a request', async () => {
		let resolve!: (value: string) => void;
		const fetcher = vi.fn(() => new Promise<string>((done) => (resolve = done)));
		mount(SWRReader, { cacheKey: 'root-loading', fetcher });
		expect(value()).toEqual({ isLoading: true, isValidating: true });

		resolve('loaded');
		await settle();
		expect(value()).toEqual({ data: 'loaded', isLoading: false, isValidating: false });
		expect(fetcher).toHaveBeenCalledOnce();
	});

	// Per use-swr-integration.test.tsx:139 — 'should dedupe requests by default'.
	it('deduplicates concurrent sibling requests by serialized key', async () => {
		const fetcher = vi.fn(async () => 'shared');
		mount(SWRSiblings, { cacheKey: ['sibling', 1], fetcher });
		await settle();
		expect(fetcher).toHaveBeenCalledOnce();
		expect(value('first').data).toBe('shared');
		expect(value('second').data).toBe('shared');
	});

	// Per use-swr-local-mutation.test.tsx:794 — 'isLoading and isValidating should be false when
	// revalidate is set to false'.
	it('publishes a cache mutation without revalidation', async () => {
		const fetcher = vi.fn(async () => 'initial');
		mount(SWRReader, { cacheKey: 'root-mutate', fetcher });
		await settle();
		await mutate('root-mutate', 'mutated', false);
		await settle();
		expect(value().data).toBe('mutated');
		expect(fetcher).toHaveBeenCalledOnce();
	});

	// Per use-swr-focus.test.tsx:15 — 'should revalidate on focus by default'.
	// Per use-swr-reconnect.test.tsx:11 — 'should revalidate on reconnect by default'.
	it('revalidates on focus and reconnect through the pinned environment adapters', async () => {
		// The mount effect arms the focus throttle at `Date.now() + focusThrottleInterval`
		// and a focus event revalidates only at a strictly later timestamp, so even at
		// interval 0 a focus landing in the mount millisecond is throttled (upstream
		// behavior; its suite sleeps a real 1ms before focusing). Faking only `Date`
		// advances that clock deterministically while real timers keep driving the
		// environment adapters' deferred event callbacks.
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			const fetcher = vi.fn(async () => `request-${fetcher.mock.calls.length}`);
			mount(SWRReader, {
				cacheKey: 'root-events',
				fetcher,
				config: { dedupingInterval: 0, focusThrottleInterval: 0 },
			});
			await settle();
			vi.setSystemTime(Date.now() + 1);
			window.dispatchEvent(new Event('focus'));
			await settleTimers();
			window.dispatchEvent(new Event('online'));
			await settleTimers();
			expect(fetcher).toHaveBeenCalledTimes(3);
			expect(value().data).toBe('request-3');
		} finally {
			vi.useRealTimers();
		}
	});

	// Per use-swr-revalidate.test.tsx:64 — 'should respect sequences of revalidation calls
	// (cope with race condition)'.
	it('prevents an older request from overwriting a newer revalidation', async () => {
		const resolvers: ((value: string) => void)[] = [];
		const fetcher = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));
		mount(SWRReader, {
			cacheKey: 'root-race',
			fetcher,
			config: { dedupingInterval: 0 },
		});
		expect(fetcher).toHaveBeenCalledOnce();
		const revalidation = captured.mutate!();
		await settle();
		expect(fetcher).toHaveBeenCalledTimes(2);
		resolvers[1]('newer');
		await revalidation;
		await settle();
		resolvers[0]('older');
		await settle();
		expect(value().data).toBe('newer');
	});

	// Per use-swr-local-mutation.test.tsx:1275 — 'should rollback optimistic updates when
	// mutation fails'.
	it('rolls optimistic data back when a mutation rejects', async () => {
		const fetcher = vi.fn(async () => 'stable');
		mount(SWRReader, { cacheKey: 'root-rollback', fetcher });
		await settle();

		let reject!: (reason: Error) => void;
		const mutation = mutate(
			'root-rollback',
			() => new Promise<string>((_resolve, fail) => (reject = fail)),
			{ optimisticData: 'optimistic', rollbackOnError: true, revalidate: false },
		);
		await settle();
		expect(value().data).toBe('optimistic');
		reject(new Error('mutation failed'));
		await expect(mutation).rejects.toThrow('mutation failed');
		await settle();
		expect(value().data).toBe('stable');
	});

	// Per use-swr-error.test.tsx:34 — 'should trigger the onError event'.
	it('surfaces fetcher failures and invokes the pinned error callback', async () => {
		const error = new Error('fetch failed');
		const onError = vi.fn();
		const fetcher = vi.fn(async () => {
			throw error;
		});
		mount(SWRReader, {
			cacheKey: 'root-error',
			fetcher,
			config: { onError, shouldRetryOnError: false },
		});
		await settle();
		expect(value().error).toBe('fetch failed');
		expect(onError).toHaveBeenCalledWith(error, 'root-error', expect.any(Object));
	});

	// Per use-swr-error.test.tsx:229 — 'should trigger the onLoadingSlow and onSuccess event'.
	// Per use-swr-refresh.test.tsx:18 — 'should rerender automatically on interval'.
	it('fires loading-slow and polling timers deterministically and cleans polling up', async () => {
		vi.useFakeTimers();
		try {
			let resolveFirst!: (value: string) => void;
			const onLoadingSlow = vi.fn();
			const fetcher = vi
				.fn()
				.mockImplementationOnce(() => new Promise<string>((resolve) => (resolveFirst = resolve)))
				.mockResolvedValue('polled');
			mount(SWRReader, {
				cacheKey: 'root-timers',
				fetcher,
				config: {
					loadingTimeout: 5,
					refreshInterval: 10,
					dedupingInterval: 0,
					onLoadingSlow,
				},
			});
			await vi.advanceTimersByTimeAsync(5);
			expect(onLoadingSlow).toHaveBeenCalledOnce();
			resolveFirst('initial');
			await settle();
			await vi.advanceTimersByTimeAsync(10);
			await settle();
			expect(fetcher).toHaveBeenCalledTimes(2);

			root!.unmount();
			const callsAfterUnmount = fetcher.mock.calls.length;
			await vi.advanceTimersByTimeAsync(50);
			expect(fetcher).toHaveBeenCalledTimes(callsAfterUnmount);
			root = undefined;
		} finally {
			vi.useRealTimers();
		}
	});

	// Per use-swr-suspense.test.tsx:25 — 'should render fallback'.
	it('suspends an uncached request and resumes with its resolved data', async () => {
		let resolve!: (value: string) => void;
		const fetcher = vi.fn(() => new Promise<string>((done) => (resolve = done)));
		mount(SWRSuspense, { cacheKey: 'root-suspense', fetcher });
		expect(container.querySelector('[data-testid="fallback"]')?.textContent).toBe('loading');
		resolve('suspense-data');
		await settle(10);
		expect(value().data).toBe('suspense-data');
		expect(fetcher).toHaveBeenCalledOnce();
	});

	// Per use-swr-devtools.test.tsx:29 — 'window.__SWR_DEVTOOLS_REACT__ should be the same reference with React'.
	// OCTANE DIVERGENCE[swr-devtools-global][runtime:c00d484f4ecc81a0]: production setupDevTools
	// identifies Octane and deliberately does not claim React's __SWR_DEVTOOLS_REACT__.
	it('exposes __SWR_DEVTOOLS_OCTANE__ and does not claim __SWR_DEVTOOLS_REACT__', () => {
		const previousOctane = window.__SWR_DEVTOOLS_OCTANE__;
		const previousReact = window.__SWR_DEVTOOLS_REACT__;
		try {
			delete window.__SWR_DEVTOOLS_OCTANE__;
			delete window.__SWR_DEVTOOLS_REACT__;
			setupDevTools();
			expect(window.__SWR_DEVTOOLS_OCTANE__).toBe(Octane);
			expect(window.__SWR_DEVTOOLS_REACT__).toBeUndefined();
		} finally {
			if (previousOctane === undefined) delete window.__SWR_DEVTOOLS_OCTANE__;
			else window.__SWR_DEVTOOLS_OCTANE__ = previousOctane;
			if (previousReact === undefined) delete window.__SWR_DEVTOOLS_REACT__;
			else window.__SWR_DEVTOOLS_REACT__ = previousReact;
		}
	});
});
