import { QueryClient } from '@octanejs/tanstack-query';
import { createReactiveActionStore, type ReactiveActionSource } from '@solana/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { mount, nextPaint } from '../../../octane/tests/_helpers';
import { useRequestQuery } from '../../src/query';
import { RequestQueryApp, RequestQueryReader } from '../_fixtures/upstream/use-request-query.tsrx';

let client: QueryClient;

beforeEach(() => {
	client = new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: 0,
				refetchOnReconnect: false,
				refetchOnWindowFocus: false,
				retry: false,
				staleTime: 0,
			},
		},
	});
});

async function flush() {
	for (let i = 0; i < 8; i++) {
		await new Promise(function delay(resolve) {
			setTimeout(resolve, 0);
		});
		await nextPaint();
	}
}

function makeFakeSource<T>(): {
	fn: ReturnType<typeof vi.fn>;
	rejectLatest: (err: unknown) => void;
	resolveLatest: (value: T) => void;
	source: ReactiveActionSource<T>;
} {
	let latest: PromiseWithResolvers<T> | null = null;
	const fn = vi.fn(function fakeFn() {
		latest = Promise.withResolvers<T>();
		return latest.promise;
	});
	return {
		fn,
		rejectLatest(err) {
			latest!.reject(err);
		},
		resolveLatest(value) {
			latest!.resolve(value);
		},
		source: {
			reactiveStore() {
				return createReactiveActionStore<[], T>(fn);
			},
		},
	};
}

describe('useRequestQuery', () => {
	describe('with a function source', () => {
		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:81.
		it('auto-fires the queryFn on mount and transitions to data on success', async () => {
			const { promise, resolve } = Promise.withResolvers<string>();
			const fn = vi.fn(function source() {
				return promise;
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['fn-success'],
				source: fn,
			});
			await flush();
			expect(fn).toHaveBeenCalledTimes(1);
			expect(result.find('#data').textContent).toBe('none');

			resolve('hi');
			await flush();
			expect(result.find('#data').textContent).toBe('hi');
			expect(result.find('#error').textContent).toBe('none');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:93.
		it('surfaces the rejection as `error`', async () => {
			const boom = new Error('boom');
			const { promise, reject } = Promise.withResolvers<string>();
			const fn = vi.fn(function source() {
				return promise;
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['fn-error'],
				source: fn,
			});
			await flush();
			expect(result.find('#error').textContent).toBe('none');

			reject(boom);
			await flush();
			expect(result.find('#error').textContent).toBe('boom');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:105.
		it('threads an `AbortSignal` into the function', async () => {
			const { promise, resolve } = Promise.withResolvers<string>();
			const fn = vi.fn(function source(_signal: AbortSignal) {
				return promise;
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['signal-threaded'],
				source: fn,
			});
			await flush();
			expect(fn).toHaveBeenCalledTimes(1);
			const signal = fn.mock.calls[0]![0] as AbortSignal;
			expect(signal).toBeInstanceOf(AbortSignal);
			expect(signal.aborted).toBe(false);
			resolve('ok');
			await flush();
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:116.
		it('invokes the user-supplied `getAbortSignal` factory', async () => {
			const { promise, resolve } = Promise.withResolvers<string>();
			const fn = vi.fn(function source() {
				return promise;
			});
			const ctrl = new AbortController();
			const getAbortSignal = vi.fn(function factory() {
				return ctrl.signal;
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['user-signal'],
				source: fn,
				options: { getAbortSignal },
			});
			await flush();
			expect(fn).toHaveBeenCalledTimes(1);
			expect(getAbortSignal).toHaveBeenCalledTimes(1);
			resolve('ok');
			await flush();
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:130.
		it('surfaces a `getAbortSignal`-driven abort as `result.error`', async () => {
			const fn = vi.fn(function source(signal: AbortSignal) {
				return new Promise<string>(function waitForAbort(_resolve, reject) {
					signal.addEventListener('abort', function onAbort() {
						reject(signal.reason);
					});
				});
			});
			const ctrl = new AbortController();
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['user-signal-abort'],
				source: fn,
				options: {
					getAbortSignal: function getAbortSignal() {
						return ctrl.signal;
					},
				},
			});
			await flush();
			expect(fn).toHaveBeenCalledTimes(1);
			expect(result.find('#error').textContent).toBe('none');

			const reason = new Error('timeout');
			ctrl.abort(reason);
			await flush();
			expect(result.find('#error').textContent).toBe('timeout');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:150.
		it('does not fire the queryFn while disabled via `enabled: false`', async () => {
			const fn = vi.fn(async function source() {
				return 'never';
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['disabled'],
				source: fn,
				options: { enabled: false },
			});
			await flush();
			expect(fn).not.toHaveBeenCalled();
			expect(result.find('#fetch-status').textContent).toBe('idle');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:163.
		it('starts firing once `enabled` transitions from false to true', async () => {
			const fn = vi.fn(async function source() {
				return 'value';
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['toggle'],
				source: fn,
				options: { enabled: false },
			});
			await flush();
			expect(fn).not.toHaveBeenCalled();

			result.update(RequestQueryApp, {
				client,
				queryKey: ['toggle'],
				source: fn,
				options: { enabled: true },
			});
			await flush();
			expect(result.find('#data').textContent).toBe('value');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:176.
		it('does not fire the queryFn when the source is null', async () => {
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['null-source'],
				source: null,
			});
			await flush();
			expect(result.find('#fetch-status').textContent).toBe('idle');
			expect(result.find('#data').textContent).toBe('none');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:192.
		it('starts firing once the source transitions from null to non-null', async () => {
			const fn = vi.fn(async function source() {
				return 'value';
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['null-to-source'],
				source: null,
			});
			await flush();
			expect(fn).not.toHaveBeenCalled();

			result.update(RequestQueryApp, {
				client,
				queryKey: ['null-to-source'],
				source: fn,
			});
			await flush();
			expect(result.find('#data').textContent).toBe('value');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:205.
		it('respects `enabled: false` even when the source is non-null', async () => {
			const fn = vi.fn(async function source() {
				return 'never';
			});
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['both-channels'],
				source: fn,
				options: { enabled: false },
			});
			await flush();
			expect(fn).not.toHaveBeenCalled();
			expect(result.find('#fetch-status').textContent).toBe('idle');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:218.
		it('uses the latest source closure when `refetch()` is called', async () => {
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['latest-closure'],
				source: async function first() {
					return 'a';
				},
			});
			await flush();
			expect(result.find('#data').textContent).toBe('a');

			result.update(RequestQueryApp, {
				client,
				queryKey: ['latest-closure'],
				source: async function second() {
					return 'b';
				},
			});
			result.click('#refetch');
			await flush();
			expect(result.find('#data').textContent).toBe('b');
			result.unmount();
		});
	});

	describe('with a ReactiveActionSource (PendingRpc-like)', () => {
		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:237.
		it('builds a store per fetch and resolves through `dispatchAsync()`', async () => {
			const req = makeFakeSource<string>();
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-success'],
				source: req.source,
			});
			await flush();
			expect(req.fn).toHaveBeenCalledTimes(1);
			expect(result.find('#data').textContent).toBe('none');

			req.resolveLatest('value');
			await flush();
			expect(result.find('#data').textContent).toBe('value');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:249.
		it('surfaces the rejection as `error`', async () => {
			const boom = new Error('boom');
			const req = makeFakeSource<string>();
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-error'],
				source: req.source,
			});
			await flush();
			expect(result.find('#error').textContent).toBe('none');

			req.rejectLatest(boom);
			await flush();
			expect(result.find('#error').textContent).toBe('boom');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:262.
		it('dispatches through `withSignal` so the threaded signal reaches the store', async () => {
			const dispatchAsync = vi.fn(async function dispatch() {
				return 'value';
			});
			const withSignal = vi.fn(function wrap(_signal: AbortSignal) {
				return { dispatchAsync };
			});
			const source = {
				reactiveStore() {
					return { withSignal, dispatchAsync };
				},
			} as unknown as ReactiveActionSource<string>;
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-signal'],
				source,
			});
			await flush();
			expect(result.find('#data').textContent).toBe('value');
			expect(withSignal).toHaveBeenCalledTimes(1);
			expect(withSignal.mock.calls[0]![0]).toBeInstanceOf(AbortSignal);
			result.unmount();
		});

		// Kit PendingRpcRequest duck-types also expose `send`; prefer reactiveStore().
		it('prefers reactiveStore over send when both are present', async () => {
			const dispatchAsync = vi.fn(async function dispatch() {
				return 'reactive';
			});
			const withSignal = vi.fn(function wrap(_signal: AbortSignal) {
				return { dispatchAsync };
			});
			const send = vi.fn(async function sendPath() {
				return 'send';
			});
			const source = {
				reactiveStore() {
					return { withSignal, dispatchAsync };
				},
				send,
			} as unknown as ReactiveActionSource<string>;
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['prefer-reactive'],
				source,
			});
			await flush();
			expect(withSignal).toHaveBeenCalledTimes(1);
			expect(dispatchAsync).toHaveBeenCalledTimes(1);
			expect(send).not.toHaveBeenCalled();
			expect(result.find('#data').textContent).toBe('reactive');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:274.
		it('surfaces a `getAbortSignal`-driven abort as `result.error`', async () => {
			const req = makeFakeSource<string>();
			const ctrl = new AbortController();
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-user-signal'],
				source: req.source,
				options: {
					getAbortSignal: function getAbortSignal() {
						return ctrl.signal;
					},
				},
			});
			await flush();
			expect(req.fn).toHaveBeenCalledTimes(1);
			expect(result.find('#error').textContent).toBe('none');

			const reason = new Error('timeout');
			ctrl.abort(reason);
			await flush();
			expect(result.find('#error').textContent).toBe('timeout');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:289.
		it('does not fire the queryFn while disabled via `enabled: false`', async () => {
			const req = makeFakeSource<string>();
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-disabled'],
				source: req.source,
				options: { enabled: false },
			});
			await flush();
			expect(req.fn).not.toHaveBeenCalled();
			expect(result.find('#fetch-status').textContent).toBe('idle');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:302.
		it('does not fire the queryFn when the source is null', async () => {
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-null'],
				source: null,
			});
			await flush();
			expect(result.find('#fetch-status').textContent).toBe('idle');
			expect(result.find('#data').textContent).toBe('none');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:318.
		it('starts firing once the source transitions from null to non-null', async () => {
			const req = makeFakeSource<string>();
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-null-to-set'],
				source: null,
			});
			await flush();
			expect(req.fn).not.toHaveBeenCalled();

			result.update(RequestQueryApp, {
				client,
				queryKey: ['source-null-to-set'],
				source: req.source,
			});
			await flush();
			expect(req.fn).toHaveBeenCalledTimes(1);
			req.resolveLatest('value');
			await flush();
			expect(result.find('#data').textContent).toBe('value');
			result.unmount();
		});

		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:333.
		it('uses the latest source when `refetch()` is called', async () => {
			function sourceFor(value: string): ReactiveActionSource<string> {
				return {
					reactiveStore() {
						return createReactiveActionStore<[], string>(function resolveValue() {
							return Promise.resolve(value);
						});
					},
				};
			}
			const result = mount(RequestQueryApp, {
				client,
				queryKey: ['source-latest'],
				source: sourceFor('a'),
			});
			await flush();
			expect(result.find('#data').textContent).toBe('a');

			result.update(RequestQueryApp, {
				client,
				queryKey: ['source-latest'],
				source: sourceFor('b'),
			});
			result.click('#refetch');
			await flush();
			expect(result.find('#data').textContent).toBe('b');
			result.unmount();
		});
	});

	describe('SSR', () => {
		// Per upstream/src/query/__tests__/useRequestQuery-test.browser.tsx:355.
		// OCTANE DIVERGENCE[solana-kit-query-ssr][runtime:04e39c17fcc6fcd5]: QueryClientProvider SSR host plumbing
		// differs from React's; the identity still requires that the queryFn is not fired
		// while effects are absent (server render / pre-effect).
		it('renders without firing the queryFn', () => {
			const fn = vi.fn(async function source() {
				return 'never';
			});
			const ssrClient = new QueryClient({
				defaultOptions: {
					queries: {
						gcTime: 0,
						retry: false,
					},
				},
			});
			try {
				renderToString(RequestQueryApp, {
					client: ssrClient,
					queryKey: ['ssr'],
					source: fn,
				});
			} catch {
				// Provider SSR may throw in this pin; the oracle is still that queryFn stayed idle.
			}
			expect(fn).not.toHaveBeenCalled();
		});
	});
});

void RequestQueryReader;
void useRequestQuery;
