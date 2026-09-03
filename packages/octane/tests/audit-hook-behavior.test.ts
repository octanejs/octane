import { describe, expect, it, vi } from 'vitest';
import { createElement, createRoot, HMR, hmr, lazy, memo, startTransition } from '../src/index.js';
import { act, flushEffects, mount } from './_helpers';
import { compile } from '../src/compiler/compile.js';
import {
	CaughtTransition,
	CaughtPassiveChain,
	CaughtCommitSiblings,
	FiniteCrossRender,
	CaughtUpdates,
	CaughtPendingUpdater,
	CoercedComponentKey,
	DeferredCue,
	FreshReducer,
	FreshTransitionReducer,
	FreshUpdater,
	FreshTransitionUpdater,
	HoistedMemo,
	IndependentTransitions,
	MemoFactorySelfUpdate,
	MountSelfUpdate,
	OrderedInsertion,
	RepeatedTransitionFlag,
	QueuedStateOrder,
	QueuedReducerOrder,
	AsyncQueuedStateOrder,
	AsyncInterleavedStateOrder,
	PassiveCleanup,
	TransitionStore,
	UrgentSuspendingValue,
} from './_fixtures/audit-hook-behavior.tsrx';

describe('state, component identity, and lifecycle contracts', () => {
	it.each([
		{ reducer: false, urgent: 'replace' as const, expected: '2' },
		{ reducer: true, urgent: 'replace' as const, expected: '2' },
		{ reducer: false, urgent: 'append' as const, expected: '12' },
		{ reducer: true, urgent: 'append' as const, expected: '12' },
	])('preserves a later urgent $urgent after an async Action (reducer=$reducer)', async (props) => {
		let resolve!: () => void;
		const gate = new Promise<void>((done) => {
			resolve = done;
		});
		const read = vi.fn();
		const root = mount(AsyncQueuedStateOrder, { ...props, gate, read });
		try {
			root.click('#action');
			expect(root.find('p').textContent).toBe('0');
			root.click('#urgent');
			expect(root.find('p').textContent).toBe('2');
			expect(read).toHaveBeenCalledWith(Number(props.expected));
			await act(() => resolve());
			expect(root.find('p').textContent).toBe(props.expected);
			expect(root.find('span').textContent).toBe('false');
		} finally {
			resolve();
			root.unmount();
		}
	});
	it.each([false, true])(
		'retains getter and Action ordering across repeated interleavings (reducer=%s)',
		async (reducer) => {
			let resolve!: () => void;
			const gate = new Promise<void>((done) => {
				resolve = done;
			});
			const read = vi.fn();
			const root = mount(AsyncInterleavedStateOrder, { reducer, gate, read });
			try {
				root.click('#action');
				expect(read).toHaveBeenLastCalledWith(123);
				root.click('#urgent');
				expect(read).toHaveBeenLastCalledWith(123456);
				await act(() => resolve());
				expect(root.find('p').textContent).toBe('123456');
			} finally {
				resolve();
				root.unmount();
			}
		},
	);
	it.each([QueuedStateOrder, QueuedReducerOrder])(
		'preserves urgent prefixes, transition segments, and urgent suffixes for %s',
		async (Component) => {
			const read = vi.fn();
			const root = mount(Component, {
				steps: [
					{ value: 1, transition: false },
					{ value: 2, transition: true },
					{ value: 3, transition: false },
					{ value: 4, transition: true },
					{ value: 5, transition: false },
				],
				read,
			});
			try {
				await act(() => root.click('button'));
				expect(read).toHaveBeenCalledWith(12345);
				expect(root.find('button').textContent).toBe('12345');
			} finally {
				root.unmount();
			}
		},
	);
	it.each([1, 2, 3, 1000])(
		'preserves update order across %s consecutive transitions',
		async (repeats) => {
			const root = mount(RepeatedTransitionFlag, { repeats });
			try {
				await act(() => root.click('button'));
				expect(root.find('button').textContent).toBe('false');
			} finally {
				root.unmount();
			}
		},
	);
	it.each([1, NaN, true])(
		'normalizes direct component key %s before comparing identity',
		(value) => {
			const root = mount(CoercedComponentKey, { value });
			try {
				root.click('button');
				const button = root.find('button');
				root.update(CoercedComponentKey, { value: String(value) });
				expect(root.find('button')).toBe(button);
				expect(button.textContent).toBe('1');
			} finally {
				root.unmount();
			}
		},
	);
	it('does not transfer memo behavior when an HOC hoists static properties', () => {
		const root = mount(HoistedMemo, { value: 'old' });
		try {
			root.update(HoistedMemo, { value: 'new' });
			expect(root.find('section').textContent).toBe('newold');
		} finally {
			root.unmount();
		}
	});
	it('does not unwrap an HOC after it hoists hot-reload metadata', () => {
		const original = hmr(() => createElement('span', null, 'original'));
		const wrapper = () => createElement('span', null, 'wrapper');
		for (const key of Reflect.ownKeys(original)) {
			if (
				key !== 'name' &&
				key !== 'length' &&
				key !== 'prototype' &&
				key !== 'caller' &&
				key !== 'arguments'
			)
				Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(original, key)!);
		}
		const root = mount(original);
		try {
			(original as any)[HMR].update(wrapper);
			flushEffects();
			expect(root.find('span').textContent).toBe('wrapper');
		} finally {
			root.unmount();
		}
	});
	it('exposes memo component identity and a writable display name', () => {
		function NamedBody() {
			return createElement('span', null, 'named');
		}
		const wrapped = memo(NamedBody);
		expect(wrapped.type).toBe(NamedBody);
		expect(wrapped.displayName).toBe('NamedBody');
		wrapped.displayName = 'PublicName';
		expect(wrapped.displayName).toBe('PublicName');
		const root = mount(wrapped);
		try {
			expect(root.find('span').textContent).toBe('named');
		} finally {
			root.unmount();
		}
	});
	it('exposes lazy display names without starting the loader', async () => {
		function LoadedBody() {
			return createElement('span', null, 'loaded');
		}
		let loads = 0;
		const wrapped = lazy(() => {
			loads++;
			return Promise.resolve({ default: LoadedBody });
		});
		expect(wrapped.displayName).toBe('Lazy');
		expect(loads).toBe(0);
		const root = mount(wrapped);
		try {
			await act(() => {});
			expect(root.find('span').textContent).toBe('loaded');
			expect(wrapped.displayName).toBe('LoadedBody');
			wrapped.displayName = 'PublicLazy';
			expect(wrapped.displayName).toBe('PublicLazy');
			expect(loads).toBe(1);
		} finally {
			root.unmount();
		}
	});
	it('reduces queued actions with the reducer from the next render', () => {
		const root = mount(FreshReducer);
		try {
			root.click('button');
			expect(root.find('button').textContent).toBe('10');
		} finally {
			root.unmount();
		}
	});
	it('reduces transition actions with the reducer from the next render', async () => {
		const root = mount(FreshTransitionReducer);
		try {
			await act(() => root.click('button'));
			expect(root.find('button').textContent).toBe('10');
		} finally {
			root.unmount();
		}
	});
	it('evaluates a queued functional updater after earlier updates in the same batch', () => {
		const root = mount(FreshUpdater);
		try {
			root.click('button');
			expect(root.find('button').textContent).toBe('200');
		} finally {
			root.unmount();
		}
	});
	it.each([false, true])(
		'evaluates transition functional updaters with current inputs during render (initially a no-op: %s)',
		async (noop) => {
			const root = mount(FreshTransitionUpdater, { noop });
			try {
				await act(() => root.click('button'));
				expect(root.find('button').textContent).toBe(noop ? '100' : '200');
			} finally {
				root.unmount();
			}
		},
	);
	it.each([false, true])(
		'routes updater errors to the rendering boundary (reducer: %s)',
		(reducer) => {
			const root = mount(CaughtUpdates, { reducer });
			try {
				root.click('button');
				expect(root.find('p').textContent).toBe(reducer ? 'reducer failed' : 'updater failed');
			} finally {
				root.unmount();
			}
		},
	);
	it('keeps a throwing updater staged until its async action settles', async () => {
		let resolve!: () => void;
		let start!: () => void;
		const wait = new Promise<void>((done) => {
			resolve = done;
		});
		const root = mount(CaughtPendingUpdater, {
			wait,
			bind: (fn) => {
				start = fn;
			},
		});
		try {
			await act(start);
			expect(root.find('span').textContent).toBe('pending');
			expect(root.findAll('p')).toHaveLength(0);
			await act(resolve);
			expect(root.find('p').textContent).toBe('staged updater failed');
		} finally {
			resolve();
			await act(() => {});
			root.unmount();
		}
	});
	it('finishes passive cleanups before root unmount returns', () => {
		const log: string[] = [];
		const root = mount(PassiveCleanup, { log: (message) => log.push(message) });
		flushEffects();
		root.unmount();
		expect(log).toEqual(['effect', 'cleanup']);
	});
	it('does not run effects for state discarded by a mount-time self-update', () => {
		const log: string[] = [];
		const root = mount(MountSelfUpdate, { log: (message) => log.push(message) });
		try {
			flushEffects();
			expect(root.find('span').textContent).toBe('1');
			expect(log).toEqual(['effect 1']);
		} finally {
			root.unmount();
		}
	});
	it('replays a self-update scheduled by a memo factory before children mount', () => {
		const log: string[] = [];
		const root = mount(MemoFactorySelfUpdate, { log: (message) => log.push(message) });
		try {
			flushEffects();
			expect(root.find('span').textContent).toBe('2');
			expect(log).toEqual(['effect 2']);
		} finally {
			root.unmount();
		}
	});
	it('mounts inserted keyed rows in their authored order', () => {
		const log: string[] = [];
		const props = { names: ['a', 'b'], log: (message: string) => log.push(message) };
		const root = mount(OrderedInsertion, props);
		try {
			flushEffects();
			log.length = 0;
			root.update(OrderedInsertion, { ...props, names: ['x', 'a', 'y', 'b'] });
			flushEffects();
			expect(root.find('ul').textContent).toBe('xayb');
			expect(log).toEqual(['ref x', 'ref y', 'layout x', 'layout y', 'passive x', 'passive y']);
		} finally {
			root.unmount();
		}
	});
});

describe('transition ownership', () => {
	it.each([false, true])(
		'reports an unhandled hook action through its root and unmounts (async: %s)',
		async (asynchronous) => {
			const container = document.createElement('div');
			document.body.appendChild(container);
			let start!: (fn: () => void | Promise<unknown>) => void;
			const reported: unknown[] = [];
			const root = createRoot(container, {
				onUncaughtError: (error) => {
					reported.push(error);
				},
			});
			const error = new Error('unhandled hook action');
			const globalError = (event: ErrorEvent) => {
				event.preventDefault();
			};
			window.addEventListener('error', globalError);
			try {
				root.render(IndependentTransitions, {
					bind: (fn: (action: () => void | Promise<unknown>) => void) => {
						start = fn;
					},
				});
				await act(() =>
					start(() => {
						if (asynchronous) return Promise.reject(error);
						throw error;
					}),
				);
				expect(reported).toEqual([error]);
				expect(container.textContent).toBe('');
			} finally {
				root.unmount();
				container.remove();
				window.removeEventListener('error', globalError);
			}
		},
	);
	it('shows the fallback when an urgent state update supersedes a held transition', async () => {
		let transition!: (value: number) => void;
		let urgent!: (value: number) => void;
		let resolve!: (value: number) => void;
		const third = new Promise<number>((done) => {
			resolve = done;
		});
		const second = new Promise<number>(() => {});
		const ready = { status: 'fulfilled', value: 1, then() {} } as unknown as PromiseLike<number>;
		const root = mount(UrgentSuspendingValue, {
			promiseFor: (value) => (value === 1 ? ready : value === 2 ? second : third),
			bind: (a, b) => {
				transition = a;
				urgent = b;
			},
		});
		try {
			await act(() => transition(2));
			expect(root.find('b').textContent).toBe('true');
			expect(root.findAll('p')).toHaveLength(0);
			await act(() => urgent(3));
			expect(root.find('p').textContent).toBe('loading');
			expect(root.find('b').textContent).toBe('false');
			await act(() => resolve(3));
			expect(root.find('span').textContent).toBe('3');
			expect(root.findAll('p')).toHaveLength(0);
		} finally {
			resolve(3);
			await act(() => {});
			root.unmount();
		}
	});
	it('keeps external-store writes urgent inside a transition', async () => {
		let start!: (fn: () => void) => void;
		let value = 1;
		const listeners = new Set<() => void>();
		const ready = { status: 'fulfilled', value: 1, then() {} } as unknown as PromiseLike<number>;
		const pending = new Promise<number>(() => {});
		const root = mount(TransitionStore, {
			get: () => value,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			promiseFor: (value) => (value === 1 ? ready : pending),
			bind: (s) => {
				start = s;
			},
		});
		try {
			await act(() => {});
			await act(() =>
				start(() => {
					value = 2;
					for (const listener of listeners) listener();
				}),
			);
			expect(root.find('p').textContent).toBe('loading');
			expect(root.find('b').textContent).toBe('false');
		} finally {
			root.unmount();
		}
	});
	it('tracks only actions started by each hook', async () => {
		let first!: (fn: () => void | Promise<unknown>) => void;
		let second!: typeof first;
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		const root = mount(IndependentTransitions, {
			bind: (a, b) => {
				first = a;
				second = b;
			},
		});
		try {
			await act(() => first(() => promise));
			expect(root.find('span').textContent).toBe('true:false');
			await act(resolve);
			expect(root.find('span').textContent).toBe('false:false');
			await act(() => second(() => {}));
			expect(root.find('span').textContent).toBe('false:false');
		} finally {
			resolve();
			await act(() => {});
			root.unmount();
		}
	});
	it('keeps the stale cue until the deferred result can commit', async () => {
		let resolve!: (value: number) => void;
		const pending = new Promise<number>((done) => {
			resolve = done;
		});
		const ready = { status: 'fulfilled', value: 1, then() {} } as unknown as PromiseLike<number>;
		const promiseFor = (value: number) => (value === 1 ? ready : pending);
		const root = mount(DeferredCue, { value: 1, promiseFor });
		try {
			await act(() => root.update(DeferredCue, { value: 2, promiseFor }));
			expect(root.find('span').textContent).toBe('1');
			expect(root.find('section').getAttribute('data-stale')).toBe('yes');
			await act(() => resolve(2));
			expect(root.find('span').textContent).toBe('2');
			expect(root.find('section').getAttribute('data-stale')).toBe('no');
		} finally {
			resolve(2);
			await act(() => {});
			root.unmount();
		}
	});
	it('does not mark hooks pending for module-level transitions', async () => {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		const root = mount(IndependentTransitions, { bind: () => {} });
		try {
			await act(() => startTransition(() => promise));
			expect(root.find('span').textContent).toBe('false:false');
		} finally {
			resolve();
			await act(() => {});
			root.unmount();
		}
	});
	it.each([false, true])(
		'routes transition errors to the owner boundary (async: %s)',
		async (async) => {
			let start!: (fn: () => void | Promise<unknown>) => void;
			const root = mount(CaughtTransition, {
				bind: (value) => {
					start = value;
				},
			});
			try {
				await act(() =>
					start(
						async
							? () => Promise.reject(new Error('action failed'))
							: () => {
									throw new Error('action failed');
								},
					),
				);
				expect(root.find('p').textContent).toBe('action failed');
			} finally {
				root.unmount();
			}
		},
	);
});

describe('effect update depth and commit recovery', () => {
	it.each([false, true])(
		'warns without aborting a finite passive chain (cleanup: %s)',
		async (cleanup) => {
			const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
			const root = mount(CaughtPassiveChain, { cleanup });
			try {
				await act(() => {});
				expect(root.findAll('p')).toHaveLength(0);
				expect(root.find('span').textContent).toBe('60');
				const warnings = warning.mock.calls.filter((args) =>
					String(args[0]).includes('Maximum update depth exceeded'),
				);
				expect(warnings).toHaveLength(process.env.NODE_ENV === 'production' ? 0 : 1);
			} finally {
				root.unmount();
				warning.mockRestore();
			}
		},
	);
	it('allows a cross-component render chain to converge before fifty updates', async () => {
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof mount> | undefined;
		try {
			root = mount(FiniteCrossRender);
			await act(() => {});
			expect(root.find('span').textContent).toBe('40');
		} finally {
			root?.unmount();
			warning.mockRestore();
		}
	});
	it.each([false, true])(
		'finishes sibling effects before recovering from a commit error (passive: %s)',
		async (passive) => {
			const log: string[] = [];
			const root = mount(CaughtCommitSiblings, { passive, log: (value) => log.push(value) });
			try {
				await act(() => {});
				expect(root.find('p').textContent).toBe('commit failed');
				const phase = passive ? 'passive' : 'layout';
				expect(log).toEqual([phase + ' first', phase + ' second', phase + ' cleanup second']);
			} finally {
				root.unmount();
			}
		},
	);
});

describe('setup checkpoint emission', () => {
	const checkpoint = '__s.block.pending';
	function compiled(body: string, imports = 'useCallback, useMemo, useRef, useState'): string {
		return compile(
			`import { ${imports} } from 'octane';\nexport function App(props: any) @{\n${body}\n<output>{String(props.n)}</output>\n}`,
			'setup-checkpoint.tsrx',
			{ mode: 'client', dev: false, hmr: false },
		).code;
	}

	it('omits the checkpoint when setup only reads built-in hooks and pure globals', () => {
		const code = compiled(`
			const value = useMemo(() => props.n * 2, [props.n]);
			const read = useCallback(() => value, [value]);
			const label = useRef(String(props.n) + Math.max(props.n, 1) + JSON.stringify(read.length));
			const [count] = useState(() => Number(label.current));
			const keys = Object.keys(props).length + Number(Array.isArray(props.list)) + Date.now();
			if (count > keys) props.n = JSON.parse(label.current);
		`);
		expect(code).not.toContain(checkpoint);
	});

	it.each([
		[
			'a setter called in setup',
			`const [value, setValue] = useState(0);\nif (value === 0) setValue(1);`,
		],
		[
			'a memo factory that calls a setter',
			`const [value, setValue] = useState(0);\nconst doubled = useMemo(() => { if (value === 0) setValue(1); return value * 2; }, [value]);`,
		],
		[
			'a memo factory passed by reference',
			`const [value, setValue] = useState(0);\nfunction read() { if (value === 0) setValue(1); return value; }\nconst doubled = useMemo(read, [value]);`,
		],
		['a state initializer passed by reference', `const [value] = useState(props.getInitial);`],
		[
			'a conditional memo factory',
			`const [value, setValue] = useState(0);\nconst doubled = useMemo(props.fast ? () => value : () => { setValue(1); return value; }, [value]);`,
		],
		[
			'a global that iterates or maps its input',
			`const value = Array.from(props.items, props.map);`,
		],
		['a JSON reviver passed by reference', `const value = JSON.parse(props.text, props.revive);`],
		[
			'a JSON replacer passed by reference',
			`const value = JSON.stringify(props.n, props.replace);`,
		],
		[
			'an unlisted namespace member',
			`const value = Object.groupBy(props.items, (item: any) => item.kind);`,
		],
		['a custom hook call', `const value = useThing(props.n);`],
		['a prop callback call', `props.observe(props.n);`],
		[
			'a shadowed global namespace',
			`const Math = props.math;\nconst value = Math.max(props.n, 1);`,
		],
	])('keeps the checkpoint for %s', (_, body) => {
		expect(compiled(body)).toContain(checkpoint);
	});
});
