import { describe, it, expect } from 'vitest';
import { mount, act } from './_helpers';
import { ChainHost, DependentChain, BatchCatch, GatedHost } from './_fixtures/parallel-use.tsrx';

// Runtime behavior of the parallel-use pipeline (the suite compiles fixtures
// with `parallelUse: true` — see vitest.config.js).

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
	reject: (e: any) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void, reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

// One deferred per (level, version) key, with a call log — the chain tests
// assert WHEN each fetch started, which is the whole point of warming.
function chainFetcher() {
	const calls: string[] = [];
	const jobs = new Map<string, Deferred<string>>();
	const fetch = (level: number, version: number): Promise<string> => {
		const key = `${level}:${version}`;
		calls.push(key);
		let d = jobs.get(key);
		if (d === undefined) {
			d = deferred<string>();
			jobs.set(key, d);
		}
		return d.promise;
	};
	const settle = (level: number, version: number) =>
		jobs.get(`${level}:${version}`)!.resolve(`v${version}-L${level}`);
	return { calls, fetch, settle };
}

describe('parallel use() — fetch-tree warming (nested chain)', () => {
	it('starts EVERY level of a nested chain in the first attempt', async () => {
		const f = chainFetcher();
		const r = mount(ChainHost, { version: 0, max: 3, fetch: f.fetch });
		// The benchmark assertion: level 0 mounts and suspends, and the warm
		// walk has already started levels 1 and 2 — no per-level rounds.
		expect(f.calls).toEqual(['0:0', '1:0', '2:0']);
		expect(r.find('.fallback').textContent).toBe('chain-loading');

		await act(() => f.settle(0, 0));
		await act(() => f.settle(1, 0));
		await act(() => f.settle(2, 0));
		expect(r.findAll('.val').map((el: Element) => el.textContent)).toEqual([
			'v0-L0',
			'v0-L1',
			'v0-L2',
		]);
		// Warm entries were ADOPTED by the real mounts — one fetch per key,
		// never a duplicate.
		expect(f.calls).toEqual(['0:0', '1:0', '2:0']);
		r.unmount();
	});

	it('an update refetches the whole chain in parallel (and adoption prevents double fetches)', async () => {
		const f = chainFetcher();
		const r = mount(ChainHost, { version: 0, max: 3, fetch: f.fetch });
		await act(() => f.settle(0, 0));
		await act(() => f.settle(1, 0));
		await act(() => f.settle(2, 0));
		expect(f.calls).toEqual(['0:0', '1:0', '2:0']);

		r.update(ChainHost, { version: 1, max: 3, fetch: f.fetch });
		// All three v1 fetches started before ANY of them resolved — the
		// update round-trips at max(latency), not sum(latency).
		expect(f.calls.slice(3)).toEqual(['0:1', '1:1', '2:1']);

		await act(() => f.settle(0, 1));
		await act(() => f.settle(1, 1));
		await act(() => f.settle(2, 1));
		expect(r.findAll('.val').map((el: Element) => el.textContent)).toEqual([
			'v1-L0',
			'v1-L1',
			'v1-L2',
		]);
		expect(f.calls).toHaveLength(6); // adoption — no re-fetch on the resume renders
		r.unmount();
	});
});

describe('parallel use() — true data dependencies stay sequential', () => {
	it('a creation reading an earlier use() result starts only after it resolves', async () => {
		let bArg: string | null = null;
		const da = deferred<string>();
		const db = deferred<string>();
		let bCalls = 0;
		const fetchA = () => da.promise;
		const fetchB = (a: string) => {
			bCalls++;
			bArg = a;
			return db.promise;
		};
		const r = mount(DependentChain, { fetchA, fetchB });
		expect(bCalls).toBe(0); // second stratum NOT speculatively started
		expect(r.find('.fallback').textContent).toBe('dep-loading');

		await act(() => da.resolve('A'));
		expect(bCalls).toBe(1);
		expect(bArg).toBe('A'); // real value, not a placeholder
		expect(r.find('.fallback').textContent).toBe('dep-loading');

		await act(() => db.resolve('B'));
		expect(r.find('.dep').textContent).toBe('A/B');
		r.unmount();
	});
});

describe('parallel use() — batched rejection routing', () => {
	it('first-in-order rejection reaches @catch', async () => {
		const da = deferred<string>();
		const db = deferred<string>();
		const r = mount(BatchCatch, { a: da.promise, b: db.promise });
		expect(r.find('.fallback').textContent).toBe('w');

		await act(() => da.reject(new Error('boom-a')));
		expect(r.find('.err').textContent).toBe('caught:boom-a');
		r.unmount();
	});

	it('later-in-order rejection while the earlier is pending still lands in @catch', async () => {
		const da = deferred<string>();
		const db = deferred<string>();
		const r = mount(BatchCatch, { a: da.promise, b: db.promise });

		// b rejects first: the batch wakes, the replay re-suspends on a (still
		// pending) — correct arm, one extra cycle on the error path.
		await act(() => db.reject(new Error('boom-b')));
		expect(r.find('.fallback').textContent).toBe('w');

		await act(() => da.resolve('A'));
		expect(r.find('.err').textContent).toBe('caught:boom-b');
		r.unmount();
	});
});

describe('parallel use() — warm exclusion for suspended-data props', () => {
	it('a child whose props read the suspended value is not prefetched', async () => {
		const da = deferred<{ id: string }>();
		const dLeaf = deferred<string>();
		let leafCalls: string[] = [];
		const fetchA = () => da.promise;
		const fetchLeaf = (id: string) => {
			leafCalls.push(id);
			return dLeaf.promise;
		};
		const r = mount(GatedHost, { fetchA, fetchLeaf });
		expect(leafCalls).toEqual([]); // data-dependent — correctly NOT warmed

		await act(() => da.resolve({ id: 'the-id' }));
		expect(leafCalls).toEqual(['the-id']);

		await act(() => dLeaf.resolve('leaf!'));
		expect(r.find('.leaf').textContent).toBe('leaf!');
		r.unmount();
	});
});
