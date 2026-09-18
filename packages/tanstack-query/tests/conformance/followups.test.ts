/**
 * Follow-up hooks: useInfiniteQuery, useSuspenseQuery, useQueries, useIsFetching,
 * useIsMutating (→ useMutationState), and usePrefetchQuery — each driving the real
 * query-core observers/caches.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, dehydrate } from '@octanejs/tanstack-query';
import { act } from 'octane';
import { mount, nextPaint } from '../_helpers';
import {
	Infinite,
	Queries,
	Fetching,
	Mutating,
	Prefetch,
	SuspenseQApp,
	SequentialSuspenseQApp,
	HydrationApp,
} from '../_fixtures/followups.tsrx';

let client: QueryClient;
beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.mount();
});

async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('useInfiniteQuery', () => {
	// @parity-case conformance:f165617264a7297f
	it('loads the first page', async () => {
		const r = mount(Infinite, { client });
		expect(r.find('#status').textContent).toBe('pending');
		await flush();
		expect(r.find('#status').textContent).toBe('pages:p0');
		r.unmount();
	});
});

describe('useQueries', () => {
	// @parity-case conformance:cf4083baef5b2612
	it('runs multiple queries and combines their results', async () => {
		const r = mount(Queries, { client });
		await flush();
		expect(r.find('#status').textContent).toBe('A,B');
		r.unmount();
	});
});

describe('useIsFetching', () => {
	// @parity-case conformance:0b9605470700de6b
	it('reports 1 while fetching and 0 once settled', async () => {
		let resolveFn: (v: string) => void = () => {};
		const queryFn = () => new Promise<string>((res) => (resolveFn = res));
		const r = mount(Fetching, { client, queryFn });
		await flush();
		expect(r.find('#status').textContent).toBe('fetching:1 status:pending');
		resolveFn('x');
		await flush();
		expect(r.find('#status').textContent).toBe('fetching:0 status:success');
		r.unmount();
	});
});

describe('useIsMutating / useMutationState', () => {
	// @parity-case conformance:33f6e25f1a2b4ded
	it('reports 1 while a mutation is pending, then 0', async () => {
		let resolveFn: (v: string) => void = () => {};
		const mutationFn = () => new Promise<string>((res) => (resolveFn = res));
		const r = mount(Mutating, { client, mutationFn });
		expect(r.find('#status').textContent).toBe('pending:0');
		r.click('#go');
		await flush();
		expect(r.find('#status').textContent).toBe('pending:1');
		resolveFn('done');
		await flush();
		expect(r.find('#status').textContent).toBe('pending:0');
		r.unmount();
	});
});

describe('usePrefetchQuery', () => {
	// @parity-case conformance:1802ff7691803bc4
	it('prefetches into the cache', async () => {
		const r = mount(Prefetch, { client });
		await flush();
		expect(client.getQueryData(['pf'])).toBe('PF');
		r.unmount();
	});
});

describe('HydrationBoundary', () => {
	// @parity-case conformance:1e6e1b8a6ec9186c
	it('hydrates dehydrated state into the client before children read it', async () => {
		const source = new QueryClient();
		await source.prefetchQuery({ queryKey: ['h'], queryFn: () => Promise.resolve('hydrated') });
		const state = dehydrate(source);
		const r = mount(HydrationApp, { client, state });
		await flush();
		// staleTime:Infinity + hydrated data ⇒ no refetch; the hydrated value shows.
		expect(r.find('#hdata').textContent).toBe('data:hydrated');
		r.unmount();
	});
});

describe('useSuspenseQuery', () => {
	// @parity-case conformance:80e9ebc08c390323
	it('suspends (fallback), then renders the guaranteed data', async () => {
		let resolveFn: (v: string) => void = () => {};
		const queryFn = () => new Promise<string>((res) => (resolveFn = res));
		const r = mount(SuspenseQApp, { client, queryFn });
		expect(r.find('#fallback').textContent).toBe('loading');
		await flush();
		await act(async () => {
			resolveFn('ready');
			await flush();
		});
		expect(r.find('#data').textContent).toBe('data:ready');
		expect(r.findAll('#fallback')).toHaveLength(0);
		r.unmount();
	});

	// @parity-case conformance:4ac0c99df4c76af3
	it('keeps sequential queries suspended until each query has data', async () => {
		let resolveA: (value: string) => void = () => {};
		let resolveB: (value: string) => void = () => {};
		const promiseA = new Promise<string>((resolve) => {
			resolveA = resolve;
		});
		const promiseB = new Promise<string>((resolve) => {
			resolveB = resolve;
		});
		const queryFnA = () => promiseA;
		const queryFnB = () => promiseB;

		const r = mount(SequentialSuspenseQApp, { client, queryFnA, queryFnB });
		expect(r.find('#sequential-fallback').textContent).toBe('loading');

		await act(async () => {
			resolveA('A');
			await flush();
		});
		// Resolving the first query must not expose the second query's pending
		// `data`; the boundary stays suspended until that data is also defined.
		expect(r.findAll('#sequential-fallback')).toHaveLength(1);
		expect(r.findAll('#sequential-data')).toHaveLength(0);
		expect(r.findAll('#sequential-error')).toHaveLength(0);

		await act(async () => {
			resolveB('B');
			await flush();
		});
		expect(r.find('#sequential-data').textContent).toBe('A/B');
		expect(r.findAll('#sequential-fallback')).toHaveLength(0);
		expect(r.findAll('#sequential-error')).toHaveLength(0);
		r.unmount();
	});
});
