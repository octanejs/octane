/**
 * `octane/signals/react`: scoped signal handles observed from a real React 19
 * tree, through subscription, scope ownership, retirement and hydration.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
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

	it('adopts a historical server value before catching up to a pre-hydration write', async () => {
		const request = createScope({ scopeKey: 'historical-request' });
		const serverName$ = request.signal$('name', 'Ada');
		function Greeting(props: {
			name$: SignalHandle<string>;
			getServerSnapshot?: () => string;
			layouts?: string[];
		}) {
			const name = useSignalValue(props.name$, props.getServerSnapshot);
			React.useLayoutEffect(() => {
				props.layouts?.push(name);
			}, [name, props.layouts]);
			return h('p', null, name);
		}
		const html = renderToString(h(Greeting, { name$: serverName$ }));
		const seed = request.serialize();
		request.dispose();

		const scope = createScope({ scopeKey: 'historical-request', seed });
		const name$ = scope.signal$('name', '');
		const frame = scope.beginAdoption(seed);
		name$.set('Lin');
		const container = document.createElement('div');
		container.innerHTML = html;
		const serverNode = container.firstChild;
		const errors: unknown[] = [];
		const layouts: string[] = [];
		let root!: Root;
		await act(() => {
			root = hydrateRoot(
				container,
				h(Greeting, { name$, getServerSnapshot: () => frame.run(() => name$.get()), layouts }),
				{ onRecoverableError: (error) => errors.push(error) },
			);
		});
		roots.push(root);
		expect(errors).toEqual([]);
		expect(container.firstChild).toBe(serverNode);
		expect(layouts[0]).toBe('Ada');
		expect(container.textContent).toBe('Lin');
		frame.release();
		await act(() => name$.set('Grace'));
		expect(container.textContent).toBe('Grace');
		await act(() => root.unmount());
		roots.splice(roots.indexOf(root), 1);
		expect(scope.inspect().retired).toBe(false);
		scope.dispose();
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
