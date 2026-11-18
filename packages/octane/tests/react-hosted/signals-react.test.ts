/**
 * `octane/signals/react`: scoped signal handles observed from a real React 19
 * tree, through subscription, scope ownership, retirement and hydration.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
	createFamily,
	createResource,
	createScope,
	query,
	ScopeDisposedError,
	type Scope,
	type SignalHandle,
} from '../../src/signals/index.js';
import { SignalScopeProvider, useSignalScope, useSignalValue } from '../../src/signals/react.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const act: <T>(scope: () => T | Promise<T>) => Promise<T> = (React as any).act;
const h = React.createElement;

function Value(props: { handle: SignalHandle<unknown>; renders?: unknown[] }) {
	const value = useSignalValue(props.handle);
	props.renders?.push(value);
	return h('output', null, String(value));
}

class Boundary extends React.Component<{ children?: React.ReactNode }, { error: unknown }> {
	override state = { error: null as unknown };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return h('p', null, error instanceof ScopeDisposedError ? 'retired' : String(error));
	}
}

/** One set of handles per scope, created with it, as an application would. */
const labels = new WeakMap<Scope, ReturnType<Scope['signal$']>>();
function labelScope(scopeKey: string, label: unknown): Scope {
	const scope = createScope({ scopeKey });
	labels.set(scope, scope.signal$('label', label));
	return scope;
}
function Label() {
	return h(Value, { handle: labels.get(useSignalScope())! });
}

function subscribers(scope: Scope, key: string): number {
	return scope.inspect().nodes.find((node) => node.key === key)?.subscribers ?? 0;
}

const roots: Root[] = [];
function mount(element: React.ReactElement, container = document.createElement('div')) {
	const root = createRoot(container);
	roots.push(root);
	flushSync(() => root.render(element));
	return { root, container };
}

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
});

describe('octane/signals/react', () => {
	it('re-renders a derived reader only when its value changes', async () => {
		const scope = createScope({ scopeKey: 'selective' });
		const count$ = scope.signal$('count', 1);
		const parity$ = scope.derived$('parity', () => (count$.get() % 2 === 0 ? 'even' : 'odd'));
		const counts: unknown[] = [];
		const parities: unknown[] = [];
		const { container } = mount(
			h(
				'div',
				null,
				h(Value, { handle: count$, renders: counts }),
				h(Value, { handle: parity$, renders: parities }),
			),
		);
		await act(() => count$.set((previous) => previous + 2));
		expect(container.textContent).toBe('3odd');
		await act(() => count$.set((previous) => previous + 1));
		expect(container.textContent).toBe('4even');
		expect(counts).toEqual([1, 3, 4]);
		expect(parities).toEqual(['odd', 'even']);
	});

	it('shows a write made between render and subscription', async () => {
		const scope = createScope({ scopeKey: 'race' });
		const value$ = scope.signal$('value', 'rendered');
		function WriteBeforeSubscribe() {
			React.useLayoutEffect(() => value$.set('written'), []);
			return null;
		}
		let container!: HTMLElement;
		await act(() => {
			({ container } = mount(
				h('div', null, h(Value, { handle: value$ }), h(WriteBeforeSubscribe)),
			));
		});
		expect(container.textContent).toBe('written');
	});

	it('keeps two readers consistent inside a transition', async () => {
		const scope = createScope({ scopeKey: 'consistent' });
		const value$ = scope.signal$('value', 0);
		const seen: string[] = [];
		function Pair() {
			const first = useSignalValue(value$);
			const second = useSignalValue(value$);
			seen.push(`${first}:${second}`);
			return h('output', null, `${first}:${second}`);
		}
		const { container } = mount(h(Pair));
		await act(() => React.startTransition(() => value$.set(1)));
		expect(container.textContent).toBe('1:1');
		expect(seen.every((pair) => pair[0] === pair[2])).toBe(true);
	});

	it('holds one subscription under StrictMode and none after unmount', async () => {
		const scope = createScope({ scopeKey: 'strict' });
		const value$ = scope.signal$('value', 0);
		const { root, container } = mount(h(React.StrictMode, null, h(Value, { handle: value$ })));
		await act(async () => {});
		expect(subscribers(scope, 'value')).toBe(1);
		await act(() => value$.set(1));
		expect(container.textContent).toBe('1');
		root.unmount();
		roots.splice(roots.indexOf(root), 1);
		expect(subscribers(scope, 'value')).toBe(0);
		// The owner retires after its readers unmount without reaching them.
		scope.dispose();
	});

	it('unsubscribes while hidden by Activity and catches up when shown', async () => {
		const scope = createScope({ scopeKey: 'activity' });
		const value$ = scope.signal$('value', 'a');
		const tree = (mode: 'visible' | 'hidden') =>
			h((React as any).Activity, { mode }, h(Value, { handle: value$ }));
		const { root, container } = mount(tree('visible'));
		await act(async () => {});
		expect(subscribers(scope, 'value')).toBe(1);
		await act(() => root.render(tree('hidden')));
		expect(subscribers(scope, 'value')).toBe(0);
		await act(() => value$.set('b'));
		await act(() => root.render(tree('visible')));
		expect(subscribers(scope, 'value')).toBe(1);
		expect(container.textContent).toBe('b');
	});

	it('moves its subscription when the handle or the provided scope changes', async () => {
		const first = labelScope('owner', 'first');
		const second = labelScope('owner', 'second');
		const tree = (scope: Scope) => h(SignalScopeProvider, { scope }, h(Label));
		const { root, container } = mount(tree(first));
		await act(async () => {});
		expect(container.textContent).toBe('first');
		await act(() => root.render(tree(second)));
		expect(container.textContent).toBe('second');
		expect(subscribers(first, 'label')).toBe(0);
		expect(subscribers(second, 'label')).toBe(1);
		// A write to the scope no longer provided does not reach the tree.
		await act(() => labels.get(first)!.set('stale'));
		expect(container.textContent).toBe('second');
	});

	it('requires a provider', () => {
		function Orphan() {
			useSignalScope();
			return null;
		}
		const { container } = mount(h(Boundary, null, h(Orphan)));
		// Development builds spell the message out; production keeps its code.
		expect(container.textContent).toMatch(/No <SignalScopeProvider> above|errors\/365/);
	});

	it('throws ScopeDisposedError instead of showing a retired scope value', async () => {
		const scope = createScope({ scopeKey: 'retired' });
		const value$ = scope.signal$('value', 'live');
		const { container } = mount(h(Boundary, null, h(Value, { handle: value$ })));
		await act(async () => {});
		expect(container.textContent).toBe('live');
		await act(() => scope.dispose());
		expect(container.textContent).toBe('retired');
	});

	it('reports a scope retired between render and subscription to the boundary', async () => {
		const scope = createScope({ scopeKey: 'retired-before-subscribe' });
		const value$ = scope.signal$('value', 'live');
		function RetireBeforeSubscribe() {
			React.useLayoutEffect(() => scope.dispose(), []);
			return null;
		}
		let container!: HTMLElement;
		await act(() => {
			({ container } = mount(
				h(Boundary, null, h(Value, { handle: value$ }), h(RetireBeforeSubscribe)),
			));
		});
		expect(container.textContent).toBe('retired');
	});

	it.each(['writable', 'derived'] as const)(
		'retires an evicted %s family reader without affecting its sibling',
		async (kind) => {
			vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
			const scope = createScope({ scopeKey: `react-family-${kind}` });
			const source$ = scope.signal$('source', 0);
			const log: string[] = [];
			const generations = new Map<string, number>();
			const family = createFamily(
				scope,
				(id: string) => {
					const generation = (generations.get(id) ?? 0) + 1;
					generations.set(id, generation);
					const name = `${id}:${generation}`;
					const options = {
						watched: () => {
							log.push(`watch ${name}`);
							return () => {
								log.push(`unwatch ${name}`);
							};
						},
					};
					return kind === 'writable'
						? scope.signal$(null, `${id}:0`, options)
						: scope.derived$(null, () => `${id}:${source$.get()}`, options);
				},
				{ idle: 25 },
			);
			const old$ = family.get('a');
			const sibling$ = family.get('b');
			const idle$ = family.get('idle');
			const errors: unknown[] = [];
			const tree = (member$: SignalHandle<string>, generation: number) =>
				h(
					'div',
					null,
					h(Boundary, { key: generation }, h(Value, { handle: member$ })),
					h(Value, { handle: sibling$ }),
				);
			const container = document.createElement('div');
			const root = createRoot(container, {
				onCaughtError: (error) => {
					errors.push(error);
				},
			});
			try {
				await act(() => root.render(tree(old$, 0)));
				expect(container.textContent).toBe('a:0b:0');
				await act(() => {
					vi.advanceTimersByTime(25);
				});
				expect(family.get('a')).toBe(old$);
				expect(family.get('b')).toBe(sibling$);
				expect(family.has('idle')).toBe(false);
				expect(() => idle$.get()).toThrow(ScopeDisposedError);

				await act(() => {
					family.delete('a');
				});
				expect(errors).toHaveLength(1);
				expect(errors[0]).toBeInstanceOf(ScopeDisposedError);
				expect(container.textContent).toBe('retiredb:0');
				expect(log).toEqual(['watch a:1', 'watch b:1', 'unwatch a:1']);
				await act(() => {
					if ('set' in sibling$) sibling$.set('b:1');
					else source$.set(1);
				});
				expect(container.textContent).toBe('retiredb:1');
				const fresh$ = family.get('a');
				expect(fresh$).not.toBe(old$);
				expect(() => old$.get()).toThrow(ScopeDisposedError);
				await act(() => root.render(tree(fresh$, 1)));
				expect(container.textContent).toBe(kind === 'writable' ? 'a:0b:1' : 'a:1b:1');
				expect(log).toEqual(['watch a:1', 'watch b:1', 'unwatch a:1', 'watch a:2']);

				await act(() => root.render(null));
				expect(log.filter((entry) => entry.startsWith('unwatch')).sort()).toEqual([
					'unwatch a:1',
					'unwatch a:2',
					'unwatch b:1',
				]);
				await act(() => {
					vi.advanceTimersByTime(24);
				});
				expect([family.has('a'), family.has('b')]).toEqual([true, true]);
				await act(() => {
					vi.advanceTimersByTime(1);
				});
				expect([family.has('a'), family.has('b')]).toEqual([false, false]);
			} finally {
				await act(() => root.unmount());
				scope.dispose();
				vi.useRealTimers();
			}
		},
	);

	it.each(['clear', 'scope.dispose'] as const)(
		'removes mounted writable and derived family readers on %s',
		async (action) => {
			const scope = createScope({ scopeKey: `react-family-${action}` });
			const writable = createFamily(scope, (_id: string) => scope.signal$(null, 'writable live'));
			const derived = createFamily(scope, (_id: string) =>
				scope.derived$(null, () => 'derived live'),
			);
			const errors: unknown[] = [];
			const container = document.createElement('div');
			const root = createRoot(container, {
				onCaughtError: (error) => {
					errors.push(error);
				},
			});
			try {
				await act(() =>
					root.render(
						h(
							'div',
							null,
							h(Boundary, null, h(Value, { handle: writable.get('a') })),
							h(Boundary, null, h(Value, { handle: derived.get('a') })),
						),
					),
				);
				expect(container.textContent).toBe('writable livederived live');
				await act(() => {
					if (action === 'clear') {
						writable.clear();
						derived.clear();
					} else scope.dispose();
				});
				expect(errors).toHaveLength(2);
				for (const error of errors) expect(error).toBeInstanceOf(ScopeDisposedError);
				expect(container.textContent).toBe('retiredretired');
			} finally {
				await act(() => root.unmount());
				scope.dispose();
			}
		},
	);

	it('isolates separate roots with separate scopes', async () => {
		const scopes = [labelScope('app', 0), labelScope('app', 0)];
		const mounted = scopes.map((scope) => mount(h(SignalScopeProvider, { scope }, h(Label))));
		await act(() => labels.get(scopes[0]!)!.set(5));
		expect(mounted.map(({ container }) => container.textContent)).toEqual(['5', '0']);
	});

	it('hydrates from a seeded scope and keeps server requests apart', async () => {
		const greetings = new WeakMap<Scope, SignalHandle<string>>();
		const names = new WeakMap<Scope, ReturnType<Scope['signal$']>>();
		const requestScope = (name: string, seed?: ReturnType<Scope['serialize']>) => {
			const scope = createScope({ scopeKey: 'request', seed });
			const name$ = scope.signal$('name', name);
			names.set(scope, name$);
			greetings.set(
				scope,
				scope.derived$('greeting', () => `Hello ${name$.get()}`),
			);
			return scope;
		};
		function App() {
			return h('p', null, useSignalValue(greetings.get(useSignalScope())!));
		}
		const serve = (name: string) => {
			const scope = requestScope(name);
			const html = renderToString(h(SignalScopeProvider, { scope }, h(App)));
			return { html, seed: scope.serialize(), scope };
		};
		const ada = serve('Ada');
		const grace = serve('Grace');
		expect([ada.html, grace.html]).toEqual(['<p>Hello Ada</p>', '<p>Hello Grace</p>']);

		// The client's initial value differs; the seed must win.
		const scope = requestScope('', ada.seed);
		const container = document.createElement('div');
		container.innerHTML = ada.html;
		const errors: unknown[] = [];
		let root!: Root;
		await act(() => {
			root = hydrateRoot(container, h(SignalScopeProvider, { scope }, h(App)), {
				onRecoverableError: (error) => errors.push(error),
			});
		});
		roots.push(root);
		expect(errors).toEqual([]);
		expect(container.innerHTML).toBe('<p>Hello Ada</p>');
		await act(() => names.get(scope)!.set('Lin'));
		expect(container.innerHTML).toBe('<p>Hello Lin</p>');
	});

	it('suspends on a pending async handle and throws its failure', async () => {
		const scope = createScope({ scopeKey: 'async' });
		const outcomes = new Map<
			string,
			{ resolve: (value: string) => void; reject: (error: Error) => void }
		>();
		const load = query(
			'async-answer',
			(id: string) =>
				new Promise<string>((resolve, reject) => outcomes.set(id, { resolve, reject })),
		);
		const id$ = scope.signal$('id', 'a');
		const answer$ = createResource(scope, 'answer', () => load(id$.get()));
		const { container } = mount(
			h(
				Boundary,
				null,
				h(React.Suspense, { fallback: h('p', null, 'Loading') }, h(Value, { handle: answer$ })),
			),
		);
		expect(container.textContent).toBe('Loading');
		await act(async () => outcomes.get('a')!.resolve('A'));
		expect(container.textContent).toBe('A');
		await act(() => id$.set('b'));
		await act(async () => outcomes.get('b')!.reject(new Error('failed b')));
		expect(container.textContent).toBe('Error: failed b');
	});
});
