import { describe, it, expect } from 'vitest';
import { mount, act } from './_helpers';
import {
	ChainHost,
	DependentChain,
	BatchCatch,
	ElseIfDirectUse,
	BracelessDirectUse,
	NestedIfDirectUse,
	ConditionalDirectUseWarmHost,
	GatedHost,
	ImportedHookHost,
	ImportedHookTwiceHost,
	ImportedCapturedHookHost,
	ImportedDependentHookHost,
	AdjacentPanelsHost,
	EarlyReturnPanelsHost,
	VersionedSiblingsHost,
	RepeatedPanelsHost,
	ManyRepeatedPanelsHost,
} from './_fixtures/parallel-use.tsrx';

// Runtime behavior of the compiler's unconditional parallel-use pipeline.

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

function resourceFetcher() {
	const calls: string[] = [];
	const jobs = new Map<string, Deferred<string>>();
	const load = (resource: string, version: number): Promise<string> => {
		const key = `${resource}:${version}`;
		calls.push(key);
		let job = jobs.get(key);
		if (job === undefined) {
			job = deferred<string>();
			jobs.set(key, job);
		}
		return job.promise;
	};
	const settle = (resource: string, version: number) =>
		jobs.get(`${resource}:${version}`)!.resolve(`${resource}-v${version}`);
	return { calls, load, settle };
}

function freshResourceFetcher() {
	const calls: string[] = [];
	const jobs = new Map<string, Deferred<string>[]>();
	const load = (resource: string, version: number): Promise<string> => {
		const key = `${resource}:${version}`;
		calls.push(key);
		const job = deferred<string>();
		const list = jobs.get(key);
		if (list === undefined) jobs.set(key, [job]);
		else list.push(job);
		return job.promise;
	};
	const settleRound = async (version: number) => {
		await act(() => {
			for (const resource of ['activity', 'activity-summary', 'insights', 'insights-chart']) {
				const list = jobs.get(`${resource}:${version}`)!;
				list[list.length - 1].resolve(`${resource}-v${version}`);
			}
		});
	};
	return { calls, load, settleRound };
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

describe('parallel use() — conditional setup arms', () => {
	const fulfilled = (value: string): Promise<string> =>
		({ then: () => {}, status: 'fulfilled', value }) as unknown as Promise<string>;

	it('supports a direct use() in an else-if arm', () => {
		const calls: string[] = [];
		const r = mount(ElseIfDirectUse, {
			mode: 'b',
			load: (key: string) => {
				calls.push(key);
				return fulfilled(key);
			},
		});
		expect(r.find('.else-if-use').textContent).toBe('mode=b');
		expect(calls).toEqual(['b']);
		r.unmount();
	});

	it('supports a direct use() in a braceless conditional arm', () => {
		const calls: string[] = [];
		const r = mount(BracelessDirectUse, {
			active: true,
			load: (key: string) => {
				calls.push(key);
				return fulfilled(key);
			},
		});
		expect(r.find('.braceless-use').textContent).toBe('active=true');
		expect(calls).toEqual(['braceless']);
		r.unmount();
	});

	it('supports a direct use() in nested braceless conditional arms', () => {
		const calls: string[] = [];
		const r = mount(NestedIfDirectUse, {
			inner: true,
			outer: true,
			load: (key: string) => {
				calls.push(key);
				return fulfilled(key);
			},
		});
		expect(r.find('.nested-if-use').textContent).toBe('active=true');
		expect(calls).toEqual(['nested']);
		r.unmount();
	});

	it('warms only the selected conditional arm', () => {
		const gate = deferred<string>();
		const calls: string[] = [];
		const r = mount(ConditionalDirectUseWarmHost, {
			gate: gate.promise,
			mode: 'b',
			load: (key: string) => {
				calls.push(key);
				return new Promise<string>(() => {});
			},
		});
		expect(r.find('.conditional-warm-fallback').textContent).toBe('loading');
		// Warming must honor the same branch guards as the real child render.
		expect(calls).toEqual(['b']);
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

describe('parallel use() — imported data hooks', () => {
	it('starts independent reads in a custom hook before either one settles', async () => {
		const resources = resourceFetcher();
		const r = mount(ImportedHookHost, { load: resources.load, version: 0 });

		expect([...resources.calls].sort()).toEqual(['project:0', 'viewer:0']);
		expect(r.find('.fallback').textContent).toBe('pair-loading');

		await act(() => resources.settle('project', 0));
		expect(r.find('.fallback').textContent).toBe('pair-loading');
		await act(() => resources.settle('viewer', 0));

		expect(r.find('.project').textContent).toBe('project-v0');
		expect(r.find('.viewer').textContent).toBe('viewer-v0');
		expect([...resources.calls].sort()).toEqual(['project:0', 'viewer:0']);
		r.unmount();
	});

	it('keeps two calls to the same imported hook in disjoint memo slots', async () => {
		const resources = resourceFetcher();
		const r = mount(ImportedHookTwiceHost, { load: resources.load, version: 0 });

		// Each hook call batches its own pair. The first call suspends before the
		// second is reached, but replay must give the second call distinct memo cells.
		expect([...resources.calls].sort()).toEqual(['project:0', 'viewer:0']);
		await act(() => resources.settle('project', 0));
		await act(() => resources.settle('viewer', 0));
		expect(r.find('.imported-pair-twice').textContent).toBe(
			'project-v0|viewer-v0|project-v0|viewer-v0',
		);
		expect([...resources.calls].sort()).toEqual(['project:0', 'project:0', 'viewer:0', 'viewer:0']);
		r.unmount();
	});

	it('keeps a true dependency inside an imported custom hook sequential', async () => {
		const project = deferred<{ ownerId: string }>();
		const owner = deferred<string>();
		let projectCalls = 0;
		const ownerArgs: string[] = [];
		const r = mount(ImportedDependentHookHost, {
			loadProject: () => {
				projectCalls++;
				return project.promise;
			},
			loadOwner: (ownerId: string) => {
				ownerArgs.push(ownerId);
				return owner.promise;
			},
		});

		expect(projectCalls).toBe(1);
		expect(ownerArgs).toEqual([]);
		expect(r.find('.fallback').textContent).toBe('dependent-loading');

		await act(() => project.resolve({ ownerId: 'owner-7' }));
		expect(projectCalls).toBe(1);
		expect(ownerArgs).toEqual(['owner-7']);
		expect(r.find('.fallback').textContent).toBe('dependent-loading');

		await act(() => owner.resolve('Ada'));
		expect(r.find('.imported-dependent').textContent).toBe('owner-7/Ada');
		expect(projectCalls).toBe(1);
		expect(ownerArgs).toEqual(['owner-7']);
		r.unmount();
	});

	it('tracks an outer callback capture across a block-local shadow and label', async () => {
		const resources = resourceFetcher();
		const r = mount(ImportedCapturedHookHost, { load: resources.load, version: 0 });

		expect(resources.calls).toContain('captured:0');
		await act(() => resources.settle('captured', 0));
		expect(r.find('.imported-captured').textContent).toBe('captured-v0');

		r.update(ImportedCapturedHookHost, { load: resources.load, version: 1 });
		expect(resources.calls).toContain('captured:1');
		await act(() => resources.settle('captured', 1));
		expect(r.find('.imported-captured').textContent).toBe('captured-v1');
		r.unmount();
	});
});

describe('parallel use() — adjacent async component trees', () => {
	it('does not warm the final template after setup returns an alternate subtree', async () => {
		const resources = resourceFetcher();
		const r = mount(EarlyReturnPanelsHost, {
			load: resources.load,
			version: 0,
			alternate: true,
		});

		expect(resources.calls).toEqual(['alternate:0']);
		await act(() => resources.settle('alternate', 0));
		expect(r.find('.alternate-panel').textContent).toBe('alternate-v0');
		expect(resources.calls).toEqual(['alternate:0']);
		r.unmount();
	});

	it('does not refetch an earlier fulfilled sibling when only the later sibling suspends', async () => {
		const resources = resourceFetcher();
		const r = mount(VersionedSiblingsHost, {
			load: resources.load,
			stableVersion: 0,
			changingVersion: 0,
		});
		await act(() => resources.settle('stable', 0));
		await act(() => resources.settle('changing', 0));
		expect([...resources.calls].sort()).toEqual(['changing:0', 'stable:0']);

		r.update(VersionedSiblingsHost, {
			load: resources.load,
			stableVersion: 0,
			changingVersion: 1,
		});
		expect(resources.calls).toEqual(['stable:0', 'changing:0', 'changing:1']);
		await act(() => resources.settle('changing', 1));
		expect(r.find('.stable').textContent).toBe('stable-v0');
		expect(r.find('.changing').textContent).toBe('changing-v1');
		expect(resources.calls).toHaveLength(3);
		r.unmount();
	});

	it('warms repeated instances of the same component and dependency values', async () => {
		const resources = resourceFetcher();
		const r = mount(RepeatedPanelsHost, { load: resources.load, version: 0 });

		// One call per concrete component instance, both before either settles.
		expect(resources.calls).toEqual(['repeated:0', 'repeated:0']);
		await act(() => resources.settle('repeated', 0));
		expect(r.findAll('.repeated-panel').map((node: Element) => node.textContent)).toEqual([
			'repeated-v0',
			'repeated-v0',
		]);
		expect(resources.calls).toHaveLength(2);
		r.unmount();
	});

	it('preserves distinct results across more than 64 same-dependency component occurrences', async () => {
		const occurrenceCount = 65;
		const calls: string[] = [];
		const jobs: Deferred<string>[] = [];
		const load = (resource: string, version: number) => {
			calls.push(`${resource}:${version}`);
			const job = deferred<string>();
			jobs.push(job);
			return job.promise;
		};
		const expected = Array.from(
			{ length: occurrenceCount },
			(_, index) => `value-${index.toString().padStart(3, '0')}`,
		);
		const r = mount(ManyRepeatedPanelsHost, { load, version: 0 });

		// Every adjacent occurrence starts before any promise settles, even though
		// the component, call site, and dependency values are identical.
		expect(jobs).toHaveLength(occurrenceCount);
		expect(calls).toHaveLength(occurrenceCount);
		expect(calls.every((call) => call === 'repeated:0')).toBe(true);

		await act(() => {
			for (let index = occurrenceCount - 1; index >= 0; index--) {
				jobs[index].resolve(expected[index]);
			}
		});

		expect(r.findAll('.repeated-panel').map((node: Element) => node.textContent)).toEqual(expected);
		expect(calls).toHaveLength(occurrenceCount);
		r.unmount();
	});

	it('starts distinct sibling panels and nested children in the first attempt', async () => {
		const resources = resourceFetcher();
		const r = mount(AdjacentPanelsHost, { load: resources.load, version: 0 });
		const expected = ['activity-summary:0', 'activity:0', 'insights-chart:0', 'insights:0'];

		expect([...resources.calls].sort()).toEqual(expected);
		expect(r.find('.fallback').textContent).toBe('panels-loading');

		await act(() => resources.settle('activity', 0));
		await act(() => resources.settle('activity-summary', 0));
		await act(() => resources.settle('insights', 0));
		await act(() => resources.settle('insights-chart', 0));

		expect(r.find('.activity-value').textContent).toBe('activity-v0');
		expect(r.find('.activity-summary').textContent).toBe('activity-summary-v0');
		expect(r.find('.insights-value').textContent).toBe('insights-v0');
		expect(r.find('.insights-chart').textContent).toBe('insights-chart-v0');
		expect([...resources.calls].sort()).toEqual(expected);
		r.unmount();
	});

	it('warms again when an update returns to previously consumed dependency values', async () => {
		const resources = freshResourceFetcher();
		const expectedRound = (version: number) =>
			['activity', 'activity-summary', 'insights', 'insights-chart']
				.map((resource) => `${resource}:${version}`)
				.sort();
		const r = mount(AdjacentPanelsHost, { load: resources.load, version: 0 });
		expect([...resources.calls].sort()).toEqual(expectedRound(0));
		await resources.settleRound(0);

		r.update(AdjacentPanelsHost, { load: resources.load, version: 1 });
		expect(resources.calls.slice(4).sort()).toEqual(expectedRound(1));
		await resources.settleRound(1);

		r.update(AdjacentPanelsHost, { load: resources.load, version: 0 });
		// Returning to 0 is a fresh suspension episode. Consumed warm entries from
		// the initial mount must not serialize the sibling/nested fetch starts.
		expect(resources.calls.slice(8).sort()).toEqual(expectedRound(0));
		await resources.settleRound(0);
		expect(resources.calls).toHaveLength(12);
		r.unmount();
	});

	it('warms all adjacent resources after a same-deps hide and remount', async () => {
		const resources = freshResourceFetcher();
		const expected = ['activity-summary:0', 'activity:0', 'insights-chart:0', 'insights:0'];
		const r = mount(AdjacentPanelsHost, { load: resources.load, version: 0, show: true });
		expect([...resources.calls].sort()).toEqual(expected);
		await resources.settleRound(0);

		r.update(AdjacentPanelsHost, { load: resources.load, version: 0, show: false });
		r.update(AdjacentPanelsHost, { load: resources.load, version: 0, show: true });
		expect(resources.calls.slice(4).sort()).toEqual(expected);
		await resources.settleRound(0);
		expect(resources.calls).toHaveLength(8);
		r.unmount();
	});
});
