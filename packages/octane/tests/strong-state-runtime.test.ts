/**
 * Runtime evidence for Strong state purity diagnostics. Each rejected pattern
 * compiles in compatibility mode here so the test observes what it actually
 * does; the replacement named by the diagnostic compiles under Strong.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import {
	TransitionUrgentEquality,
	type EqualityControls,
} from './_fixtures/transition-urgent-equality.tsrx';

function fixture(body: string, strong = false) {
	return loadCompiledFixtureSource(
		`/** @jsxImportSource octane */\n${strong ? '"use strong";\n' : ''}import { memo, useEffect, useLayoutEffect, useOptimistic, useState, useSyncExternalStore, useTransition } from 'octane';\n${body}`,
		{
			id: '/src/strong-state-runtime.tsx',
			mode: 'client',
			compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
		},
	);
}

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function createStore(value: number) {
	const listeners = new Set<() => void>();
	return {
		value,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		set(next: number) {
			this.value = next;
			for (const listener of listeners) listener();
		},
	};
}

describe('state updaters and reducers can run more than once', () => {
	for (const reducer of [false, true]) {
		const kind = reducer ? 'reducer action' : 'state updater';

		it(`replays an urgent ${kind} over a held transition value`, async () => {
			let controls!: EqualityControls;
			const wait = deferred();
			const root = mount(TransitionUrgentEquality, {
				reducer,
				boundary: false,
				wait: wait.promise,
				bind: (value) => {
					controls = value;
				},
			});
			const seen: number[] = [];
			try {
				await act(() => controls.transition(2));
				expect(root.find('b').textContent).toBe('true');
				// One call. It is applied to the committed value, then rebased onto
				// the value the suspended transition is still holding.
				await act(() =>
					controls.urgent((value) => {
						seen.push(value);
						return Math.max(value, 1);
					}),
				);
				expect(seen).toContain(1);
				expect(seen).toContain(2);
			} finally {
				wait.resolve();
				await act(() => {});
				root.unmount();
			}
		});

		it(`evaluates a transition ${kind} eagerly and again when the transition renders`, async () => {
			let controls!: EqualityControls;
			const wait = deferred();
			const root = mount(TransitionUrgentEquality, {
				reducer,
				boundary: true,
				wait: wait.promise,
				bind: (value) => {
					controls = value;
				},
			});
			let calls = 0;
			try {
				await act(() =>
					controls.transition(((value: number) => {
						calls++;
						return value + 1;
					}) as unknown as number),
				);
				expect(calls).toBeGreaterThan(1);
			} finally {
				wait.resolve();
				await act(() => {});
				root.unmount();
			}
		});
	}
});

describe('mutating state outside render', () => {
	it('does not re-render when the mutated array is passed back to its setter', async () => {
		const { A } = fixture(
			`export function A() { const [items, setItems] = useState([]); return <button onClick={() => { items.push(1); setItems(items); }}>{items.length}</button>; }`,
		);
		const root = mount(A);
		try {
			root.click('button');
			root.click('button');
			await act(() => {});
			expect(root.find('button').textContent).toBe('0');
		} finally {
			root.unmount();
		}
	});

	it('leaves identity-based consumers stale when only the outer object is copied', async () => {
		const { A } = fixture(
			`const Count = memo(function Count({ list }) { return <i>{list.length}</i>; });
export function A() { const [s, setS] = useState({ list: [], n: 0 }); return <button onClick={() => { s.list.push(1); setS({ ...s, n: s.n + 1 }); }}><Count list={s.list} />{s.n}</button>; }`,
		);
		const root = mount(A);
		try {
			root.click('button');
			root.click('button');
			await act(() => {});
			expect(root.find('button').textContent).toBe('02');
		} finally {
			root.unmount();
		}
	});

	it('changes the value useOptimistic reverts to after a failed Action', async () => {
		const body = `export function A({ save, mutate }) {
  const [s, setS] = useState({ list: ['a'] });
  const [shown, add] = useOptimistic(s, (current, item) => ({ list: [...current.list, item] }));
  const [pending, start] = useTransition();
  return <button onClick={() => start(async () => {
    add('b');
    if (mutate) s.list.push('b');
    try { await save(); setS({ ...s }); } catch {}
  })}>{shown.list.join(',') + (pending ? '...' : '')}</button>;
}`;
		const results: Record<string, string> = {};
		for (const mutate of [false, true]) {
			const { A } = fixture(body);
			const request = deferred();
			const root = mount(A, { save: () => request.promise, mutate });
			try {
				root.click('button');
				await act(() => {});
				await act(async () => {
					request.reject(new Error('offline'));
					await Promise.resolve();
				});
				await act(() => {});
				results[String(mutate)] = root.find('button').textContent!;
			} finally {
				root.unmount();
			}
		}
		expect(results).toEqual({ false: 'a', true: 'a,b' });
	});

	it('never renders a mutation made by an effect', async () => {
		const { A } = fixture(
			`export function A() { const [s] = useState({ list: [] }); useEffect(() => { s.list.push(1); }); return <p>{s.list.length}</p>; }`,
		);
		const root = mount(A);
		try {
			await act(() => {});
			expect(root.find('p').textContent).toBe('0');
		} finally {
			root.unmount();
		}
	});
});

describe('deferred updates computed from a render snapshot', () => {
	for (const [label, update, strong] of [
		['the render snapshot', 'setN(n + 1)', false],
		['the updater form', 'setN((current) => current + 1)', true],
	] as const) {
		it(`counts overlapping saves with ${label}`, async () => {
			const { A } = fixture(
				`export function A({ save }) { const [n, setN] = useState(0); return <button onClick={async () => { await save(); ${update}; }}>{n}</button>; }`,
				strong,
			);
			const request = deferred();
			const root = mount(A, { save: () => request.promise });
			try {
				root.click('button');
				root.click('button');
				await act(async () => {
					request.resolve();
					await request.promise;
				});
				expect(root.find('button').textContent).toBe(strong ? '2' : '1');
			} finally {
				root.unmount();
			}
		});

		it(`counts overlapping timers with ${label}`, async () => {
			vi.useFakeTimers();
			const { A } = fixture(
				`export function A() { const [n, setN] = useState(0); return <button onClick={() => setTimeout(() => ${update}, 500)}>{n}</button>; }`,
				strong,
			);
			const root = mount(A);
			try {
				root.click('button');
				root.click('button');
				await act(() => {
					vi.advanceTimersByTime(500);
				});
				expect(root.find('button').textContent).toBe(strong ? '2' : '1');
			} finally {
				root.unmount();
				vi.useRealTimers();
			}
		});
	}
});

describe('write-only state as a store subscription', () => {
	const mutator = `function Mutator({ store }) { useLayoutEffect(() => { store.set(2); }); return null; }`;

	it('misses a store change made before its passive subscription', async () => {
		const { A } = fixture(
			`${mutator}
export function A({ store }) { const [, force] = useState(0); useEffect(() => store.subscribe(() => force((x) => x + 1))); return <p>{store.value}<Mutator store={store} /></p>; }`,
		);
		const root = mount(A, { store: createStore(1) });
		try {
			await act(() => {});
			expect(root.find('p').textContent).toBe('1');
		} finally {
			root.unmount();
		}
	});

	it('renders that change through useSyncExternalStore', async () => {
		const { A } = fixture(
			`${mutator}
export function A({ store }) { const value = useSyncExternalStore(store.subscribe, () => store.value, () => 0); return <p>{value}<Mutator store={store} /></p>; }`,
			true,
		);
		const root = mount(A, { store: createStore(1) });
		try {
			await act(() => {});
			expect(root.find('p').textContent).toBe('2');
		} finally {
			root.unmount();
		}
	});
});

describe('useSyncExternalStore snapshots', () => {
	it('loops until the update-depth limit when getSnapshot allocates', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { A } = fixture(
			`export function A({ store }) { const s = useSyncExternalStore(store.subscribe, () => ({ a: store.value })); return <p>{s.a}</p>; }`,
		);
		const store = createStore(1);
		let root: ReturnType<typeof mount> | undefined;
		try {
			root = mount(A, { store });
			await expect(act(() => Promise.resolve())).rejects.toThrow('Maximum update depth exceeded');
			if (process.env.NODE_ENV !== 'production') {
				expect(error.mock.calls.flat().join(' ')).toContain('result must be cached');
			}
		} finally {
			root?.unmount();
			error.mockRestore();
		}
	});

	it('renders a snapshot the store keeps', async () => {
		const { A } = fixture(
			`export function A({ store }) { const value = useSyncExternalStore(store.subscribe, () => store.value, () => 0); return <p>{value}</p>; }`,
			true,
		);
		const store = createStore(1);
		const root = mount(A, { store });
		try {
			await act(() => store.set(3));
			expect(root.find('p').textContent).toBe('3');
		} finally {
			root.unmount();
		}
	});

	// Report only: caching an inline subscribe is a codegen change that needs
	// identity and invalidation evidence of its own.
	it.each([false, true])(
		'resubscribes an inline subscribe on every render (strong=%s)',
		async (strong) => {
			const { A } = fixture(
				`export function A({ store }) { const [n, setN] = useState(0); const value = useSyncExternalStore((cb) => store.subscribe(cb), () => store.value, () => 0); return <button onClick={() => setN(n + 1)}>{value}{n}</button>; }`,
				strong,
			);
			let subscriptions = 0;
			const store = createStore(1);
			const subscribe = store.subscribe.bind(store);
			store.subscribe = (listener) => {
				subscriptions++;
				return subscribe(listener);
			};
			const root = mount(A, { store });
			try {
				await act(() => {});
				root.click('button');
				await act(() => {});
				root.click('button');
				await act(() => {});
				expect(subscriptions).toBe(3);
			} finally {
				root.unmount();
			}
		},
	);
});
