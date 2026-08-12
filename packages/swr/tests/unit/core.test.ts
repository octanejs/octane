import { describe, expect, it, vi } from 'vitest';
import {
	createCacheHelper,
	initCache,
	mergeConfigs,
	normalize,
	preload,
	serialize,
	stableHash,
	subscribeCallback,
	withMiddleware,
} from '../../src/_internal/index';
import { readDevtoolsMiddleware, setupOctaneDevtools } from '../../src/_internal/devtools-contract';
import type { Middleware } from '../../src/_internal/index';
import { middleware as preloadMiddleware } from '../../src/_internal/utils/preload';

describe('SWR U2 framework-neutral core', () => {
	it('preserves primitive, structural, circular, throwing, and falsy key serialization', () => {
		expect(serialize([])[0]).toBe('');
		expect(serialize(null)[0]).toBe('');
		expect(serialize(false)[0]).toBe('');
		expect(serialize('key')).toEqual(['key', 'key']);
		expect(serialize(() => ['key', { b: 2, a: 1 }])[0]).toBe(stableHash(['key', { a: 1, b: 2 }]));
		expect(
			serialize(() => {
				throw new Error('not ready');
			}),
		).toEqual(['', '']);

		const circular: { self?: unknown } = {};
		circular.self = circular;
		expect(stableHash(circular)).toBe(stableHash(circular));
		expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
	});

	it('preserves normalization and nested config precedence', () => {
		const fetcher = () => 'data';
		expect(normalize(['key'])).toEqual(['key', null, {}]);
		expect(normalize(['key', fetcher])).toEqual(['key', fetcher, {}]);
		expect(normalize(['key', { revalidateOnFocus: false }])).toEqual([
			'key',
			null,
			{ revalidateOnFocus: false },
		]);

		const first: Middleware = (useSWRNext) => useSWRNext;
		const second: Middleware = (useSWRNext) => useSWRNext;
		expect(
			mergeConfigs(
				{ use: [first], fallback: { parent: 1, shared: 'parent' } },
				{ use: [second], fallback: { child: 2, shared: 'child' } },
			),
		).toMatchObject({
			use: [first, second],
			fallback: { parent: 1, child: 2, shared: 'child' },
		});
	});

	it('strips compiler slots from every optional root argument shape', () => {
		const slot = Symbol('compiler-slot');
		const fetcher = () => 'data';
		const config = { revalidateOnFocus: false };

		expect(normalize(['key', slot] as never)).toEqual(['key', null, {}]);
		expect(normalize(['key', null, slot] as never)).toEqual(['key', null, {}]);
		expect(normalize(['key', fetcher, slot] as never)).toEqual(['key', fetcher, {}]);
		expect(normalize(['key', config, slot] as never)).toEqual(['key', null, config]);
		expect(normalize(['key', fetcher, config, slot] as never)).toEqual(['key', fetcher, config]);
	});

	it('isolates providers, publishes snapshots, and tears subscriptions down once', () => {
		const first = new Map();
		const second = new Map();
		const firstContext = initCache(first)!;
		const secondContext = initCache(second)!;
		const [, setFirst, subscribeFirst] = createCacheHelper(first, 'key');
		const [, setSecond] = createCacheHelper(second, 'key');
		const listener = vi.fn();
		const unsubscribe = subscribeFirst('key', listener);

		setFirst({ data: 'first' });
		setSecond({ data: 'second' });
		expect(first.get('key')).toEqual({ data: 'first' });
		expect(second.get('key')).toEqual({ data: 'second' });
		expect(listener).toHaveBeenCalledOnce();

		unsubscribe();
		unsubscribe();
		setFirst({ data: 'updated' });
		expect(listener).toHaveBeenCalledOnce();
		firstContext[3]?.();
		secondContext[3]?.();
		expect(initCache(first)).toHaveLength(4);
	});

	it('removes keyed callbacks without disturbing remaining callback order', () => {
		const callbacks: Record<string, (() => void)[]> = {};
		const log: string[] = [];
		const removeFirst = subscribeCallback('key', callbacks, () => log.push('first'));
		subscribeCallback('key', callbacks, () => log.push('second'));
		removeFirst();
		callbacks.key.forEach((callback) => callback());
		expect(log).toEqual(['second']);
	});

	it('appends middleware at the same source-near boundary', () => {
		const existing = () => undefined;
		const appended = () => undefined;
		const hook = vi.fn((_key, _fetcher, config) => config.use);
		const wrapped = withMiddleware(hook as never, appended as never);
		expect(wrapped('key', null, { use: [existing] } as never)).toEqual([existing, appended]);
	});

	it('does not expose compiler slots as middleware configuration', () => {
		const appended = () => undefined;
		const hook = vi.fn((_key, _fetcher, config) => config);
		const wrapped = withMiddleware(hook as never, appended as never) as unknown as (
			...args: unknown[]
		) => unknown;
		const slot = Symbol('compiler-slot');

		expect(wrapped('key', slot)).toEqual({ use: [appended] });
		expect(wrapped('key', null, slot)).toEqual({ use: [appended] });
		expect(wrapped('key', null, { dedupingInterval: 10 }, slot)).toEqual({
			dedupingInterval: 10,
			use: [appended],
		});
		expect(hook.mock.calls.flat()).not.toContain(slot);
	});

	it('reuses a preload once and consumes it at the middleware boundary', async () => {
		const fetcher = vi.fn(async () => 'preloaded');
		const first = preload('preload-key', fetcher);
		const second = preload('preload-key', fetcher);
		expect(second).toBe(first);
		expect(fetcher).toHaveBeenCalledOnce();

		const next = vi.fn((_key, wrappedFetcher) => wrappedFetcher('preload-key'));
		const consume = preloadMiddleware(next as never);
		await expect(consume('preload-key', fetcher, {} as never)).resolves.toBe('preloaded');
		expect(fetcher).toHaveBeenCalledOnce();
		preload('preload-key', fetcher);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('accepts ordered devtools arrays but rejects hostile ambient values', () => {
		const middleware = [() => 'first', () => 'second'];
		expect(readDevtoolsMiddleware({ __SWR_DEVTOOLS_USE__: middleware })).toEqual(middleware);
		for (const value of [undefined, {}, 'string', new Set(middleware)]) {
			expect(readDevtoolsMiddleware({ __SWR_DEVTOOLS_USE__: value })).toEqual([]);
		}
		const getter = vi.fn(() => middleware);
		const hostile = Object.defineProperty({}, '__SWR_DEVTOOLS_USE__', {
			get: getter,
		});
		expect(readDevtoolsMiddleware(hostile)).toEqual([]);
		expect(getter).not.toHaveBeenCalled();
		const proxyGet = vi.fn();
		const proxy = new Proxy({}, { get: proxyGet });
		expect(readDevtoolsMiddleware({ __SWR_DEVTOOLS_USE__: proxy })).toEqual([]);
		expect(proxyGet).not.toHaveBeenCalled();

		const target: Record<string, unknown> = {};
		setupOctaneDevtools(target, { runtime: 'octane' });
		expect(target.__SWR_DEVTOOLS_OCTANE__).toEqual({ runtime: 'octane' });
		expect(target.__SWR_DEVTOOLS_REACT__).toBeUndefined();
	});
});
