import { describe, expect, it, vi } from 'vitest';
import { createScope } from 'octane/signals';
import { act, mount } from './_helpers.js';
import {
	ConsistentChain,
	LayoutActivatedSnapshot,
	NestedSnapshot,
	NewErrorChain,
	NewObjectChain,
	PendingSelector,
	RejectedSnapshot,
	type Data,
} from './_fixtures/signals-local-chains.tsrx';

// A render loop driven by microtasks starves the timers Vitest's timeout needs.
// A generous bound turns that livelock into a failure instead of a hung run.
function renderBound(): () => void {
	let renders = 0;
	return () => {
		if (++renders > 200) throw new Error('the component kept rendering without settling');
	};
}

// Every render declares a component's derived$ and query$ again. A computation
// that reads another of them must keep its committed definition while that
// handle still resolves to the same cell, or each render re-runs it and
// publishes a result its readers render again.
describe('local derived and query chains', () => {
	it('settles a derived chain that reads a pending nested snapshot (#1735)', async () => {
		const calls: string[] = [];
		const load = (key: string) => {
			calls.push(key);
			return Promise.resolve('value');
		};
		const root = mount(NestedSnapshot, { key: 'a', enabled: true, load });
		try {
			expect(root.find('span').textContent).toBe('false:false');
			await act(() => root.click('button'));
			expect(calls).toEqual(['a']);
			expect(root.find('span').textContent).toBe('true:false');
			expect(root.find('p').textContent).toBe('settled');
		} finally {
			root.unmount();
		}
	});

	it('keeps a layout-activated pending query interactive (#1735)', async () => {
		const scope = createScope({ scopeKey: 'layout-query' });
		const enabled$ = scope.signal$('enabled', true);
		let resolve!: (value: Data) => void;
		const pending = new Promise<Data>((done) => {
			resolve = done;
		});
		const load = vi.fn((_key: string) => pending);
		const root = mount(LayoutActivatedSnapshot, { fixture: { enabled$, load } });
		try {
			await act(() => {});
			expect(load).toHaveBeenCalledOnce();
			expect(root.container.querySelector('#result')).toBeNull();
			await act(() => root.click('#open'));
			expect(root.find('#panel').textContent).toBe('Panel');
			expect(root.container.querySelector('#result')).toBeNull();
			await act(() => resolve({ values: [] }));
			expect(root.find('#result').textContent).toBe('Loaded');
		} finally {
			resolve({ values: [] });
			root.unmount();
			scope.dispose();
		}
	});

	for (const skipWhilePending of [false, true]) {
		const waiting = skipWhilePending ? 'idle' : 'pending';
		it(`starts a query whose selector reads a pending query once it resolves (#1736, ${skipWhilePending ? 'snapshot' : 'get'})`, async () => {
			let resolve!: (value: string) => void;
			const gate = new Promise<string>((done) => {
				resolve = done;
			});
			const loadSource = vi.fn((_key: string) => gate);
			const loadDependent = vi.fn(async (key: string) => key);
			const root = mount(PendingSelector, {
				skipWhilePending,
				loadSource,
				loadDependent,
				onRender: renderBound(),
			});
			try {
				await act(() => {});
				expect(loadSource).toHaveBeenCalledOnce();
				expect(root.find('#status').textContent).toBe(`0:${waiting}:${waiting}`);
				await act(() => root.click('#next'));
				expect(root.find('#status').textContent).toBe(`1:${waiting}:${waiting}`);
				expect(loadDependent).not.toHaveBeenCalled();
				await act(() => resolve('value'));
				expect(root.find('#status').textContent).toBe('1:ready:ready');
				expect(loadDependent.mock.calls.map(([key]) => key)).toEqual(['1:value']);
			} finally {
				resolve('value');
				root.unmount();
			}
		});
	}

	const observations = {
		ready: 'ready:1:false:true',
		'abort-skip': 'error:none:true:false',
		abort: 'error:none:true:true',
		error: 'error:none:true:true',
	} as const;
	for (const mode of ['pending', 'ready', 'abort-skip', 'abort', 'error'] as const) {
		it(`exposes a ${mode} query to derived snapshot readers and stays interactive (#1737)`, async () => {
			const scope = createScope({ scopeKey: 'rejected-query' });
			const enabled$ = scope.signal$('enabled', true);
			let resolveLoad!: (value: Data) => void;
			const pending = new Promise<Data>((done) => {
				resolveLoad = done;
			});
			const load = vi.fn((_key: string): Promise<Data> => {
				if (mode === 'pending') return pending;
				if (mode === 'ready') return Promise.resolve({ values: [1] });
				return Promise.resolve().then(() => {
					throw mode === 'error'
						? new Error('Synthetic rejection')
						: new DOMException('Retired', 'AbortError');
				});
			});
			const fallback = vi.fn(async (_key: string): Promise<Data> => ({ values: [1] }));
			const root = mount(RejectedSnapshot, {
				fixture: {
					enabled$,
					load,
					fallback,
					skipFallback: mode === 'abort-skip',
					onRender: renderBound(),
				},
			});
			const observation = () => root.find('#observation').textContent;
			try {
				await act(() => {});
				expect(load).toHaveBeenCalledOnce();
				if (mode === 'pending') expect(observation()).toBe('pending:none:false:false');
				else expect(observation()).toBe(observations[mode]);
				expect(fallback).toHaveBeenCalledTimes(mode === 'abort' || mode === 'error' ? 1 : 0);
				await act(() => root.click('#open'));
				expect(root.find('#panel').textContent).toBe('Panel');
				if (mode === 'pending') {
					expect(fallback).not.toHaveBeenCalled();
					await act(() => resolveLoad({ values: [] }));
					expect(observation()).toBe('ready:0:true:true');
					expect(fallback).toHaveBeenCalledOnce();
				}
				expect(root.container.querySelector('#result')?.textContent ?? null).toBe(
					mode === 'abort-skip' ? null : 'Loaded',
				);
			} finally {
				resolveLoad({ values: [] });
				root.unmount();
				scope.dispose();
			}
		});
	}

	it('settles a chain whose intermediate value is a new object on each evaluation', async () => {
		const root = mount(NewObjectChain);
		try {
			expect(root.find('output').textContent).toBe('0:2');
			await act(() => root.click('#tick'));
			expect(root.find('output').textContent).toBe('1:2');
			await act(() => root.click('#count'));
			expect(root.find('output').textContent).toBe('1:3');
		} finally {
			root.unmount();
		}
	});

	it('settles a chain that reads a computation failing with a new error', async () => {
		const root = mount(NewErrorChain);
		try {
			expect(root.find('output').textContent).toBe('0:failed at 2');
			await act(() => root.click('#tick'));
			expect(root.find('output').textContent).toBe('1:failed at 2');
			await act(() => root.click('#count'));
			expect(root.find('output').textContent).toBe('1:failed at 3');
		} finally {
			root.unmount();
		}
	});

	it('commits a redeclared dependency together with the values derived from it', async () => {
		const commits: string[] = [];
		const onCommit = (pair: string) => commits.push(pair);
		const root = mount(ConsistentChain, { label: 'a', onCommit });
		try {
			await act(() => root.update(ConsistentChain, { label: 'b', onCommit }));
			expect(root.find('p').textContent).toBe('b1|B1');
			expect(commits).toContain('b1|B1');
			expect(
				commits.filter((pair) => {
					const [label, shout] = pair.split('|');
					return shout !== label!.toUpperCase();
				}),
			).toEqual([]);
		} finally {
			root.unmount();
		}
	});
});
