/**
 * `octane/signals/react`: scoped signal handles observed from a real React 19
 * tree, through subscription, scope ownership, retirement and hydration.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToPipeableStream, renderToString } from 'react-dom/server';
import { PassThrough } from 'node:stream';
import { deferred } from '../_fixtures/signals-async-controls.js';
import {
	createFamily,
	createResource,
	createScope,
	query,
	ScopeDisposedError,
	type Scope,
	type SignalHandle,
	type WritableSignal,
} from '../../src/signals/index.js';
import {
	RetainedSignalProvider,
	useOptionalRetainedSignalValue,
	useRetainedSignalValue,
	SignalScopeProvider,
	useSignalSubscription,
	useSignalScope,
	useSignalValue,
} from '../../src/signals/react.js';

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

	it('keeps a watched handle observed through Activity and releases it after hidden deletion', async () => {
		const scope = createScope({ scopeKey: 'retained-activity' });
		const stop = vi.fn();
		const watch = vi.fn(() => stop);
		const value$ = scope.signal$('value', 'first', { watched: watch });
		function Reader() {
			return h('output', null, useRetainedSignalValue(value$));
		}
		const child = h(Reader);
		const tree = (mode: 'visible' | 'hidden') => h((React as any).Activity, { mode }, child);
		const { root, container } = mount(tree('visible'));
		await act(() => {
			value$.set('queued');
			root.render(tree('hidden'));
		});
		expect(stop).not.toHaveBeenCalled();
		await act(() => root.render(tree('visible')));
		expect(container.textContent).toBe('queued');
		await act(() => root.render(tree('hidden')));
		await act(() => value$.set('hidden'));
		await act(() => root.render(tree('visible')));
		expect(container.textContent).toBe('hidden');
		expect(watch).toHaveBeenCalledOnce();
		await act(() => root.render(tree('hidden')));
		await act(() => root.render(null));
		expect(stop).toHaveBeenCalledOnce();
		expect(subscribers(scope, 'value')).toBe(0);
	});

	it('keeps a shared source watched when returning to an Activity with retention disabled', async () => {
		const scope = createScope({ scopeKey: 'activity-handoff' });
		const stop = vi.fn();
		const value$ = scope.signal$('value', 0, { watched: () => stop });
		function Reader() {
			return h('output', null, useRetainedSignalValue(value$, undefined, false));
		}
		const activity = (visible: boolean) =>
			h((React as any).Activity, { mode: visible ? 'visible' : 'hidden' }, h(Reader));
		const tree = (first: boolean) => h(React.Fragment, null, activity(first), activity(!first));
		const { root } = mount(tree(true));
		await act(() => root.render(tree(false)));
		stop.mockClear();

		await act(() => root.render(tree(true)));
		expect(stop).not.toHaveBeenCalled();
		expect(subscribers(scope, 'value')).toBe(1);
		await act(() => root.render(null));
		expect(stop).toHaveBeenCalledOnce();
	});

	it.each(['handle', 'callback'])(
		'observes a custom snapshot through a %s source and releases it for a plain fallback',
		async (kind) => {
			const scope = createScope({ scopeKey: 'projected' });
			const stop = vi.fn();
			const watch = vi.fn(() => stop);
			const count$ = scope.signal$('count', 2, { watched: watch });
			const source = kind === 'handle' ? count$ : (notify: () => void) => count$.subscribe(notify);
			function Reader({ active }: { active: boolean }) {
				const subscribe = useSignalSubscription(active ? source : null);
				const doubled = React.useSyncExternalStore(subscribe, () =>
					active ? count$.get() * 2 : 'none',
				);
				return h('output', null, doubled);
			}
			const tree = (active: boolean, hidden = false) =>
				h((React as any).Activity, { mode: hidden ? 'hidden' : 'visible' }, h(Reader, { active }));
			const { root, container } = mount(tree(false));
			expect(container.textContent).toBe('none');
			await act(() => root.render(tree(true)));
			expect(container.textContent).toBe('4');
			await act(() => count$.set(3));
			expect(container.textContent).toBe('6');
			await act(() => root.render(tree(true, true)));
			expect(stop).not.toHaveBeenCalled();
			await act(() => count$.set(5));
			await act(() => root.render(tree(true)));
			expect(container.textContent).toBe('10');
			expect(watch).toHaveBeenCalledOnce();
			await act(() => root.render(tree(false)));
			expect(container.textContent).toBe('none');
			expect(stop).toHaveBeenCalledOnce();
		},
	);

	it.each(['retained', 'subscription'] as const)(
		'%s readers inherit and can override nested Activity retention defaults',
		async (kind) => {
			const scope = createScope({ scopeKey: `provider-${kind}` });
			const value$ = scope.signal$('value', 'current');
			function RetainedReader({ explicit }: { explicit?: boolean | undefined }) {
				return h('output', null, useRetainedSignalValue(value$, undefined, explicit));
			}
			function SubscriptionReader({ explicit }: { explicit?: boolean | undefined }) {
				const subscribe = useSignalSubscription(value$, explicit);
				return h(
					'output',
					null,
					React.useSyncExternalStore(subscribe, () => value$.get()),
				);
			}
			const Reader = kind === 'retained' ? RetainedReader : SubscriptionReader;
			const tree = (mode: 'visible' | 'hidden', nested?: boolean, explicit?: boolean) =>
				h(
					RetainedSignalProvider,
					{ retainOnHide: false },
					h(
						RetainedSignalProvider,
						{ retainOnHide: nested },
						h((React as any).Activity, { mode }, h(Reader, { explicit })),
					),
				);
			const { root } = mount(tree('visible'));
			await act(() => root.render(tree('hidden')));
			expect(subscribers(scope, 'value')).toBe(0);
			await act(() => root.render(tree('visible', true)));
			await act(() => root.render(tree('hidden', true)));
			expect(subscribers(scope, 'value')).toBe(1);
			await act(() => root.render(tree('visible', true, false)));
			await act(() => root.render(tree('hidden', true, false)));
			expect(subscribers(scope, 'value')).toBe(0);
			await act(() => root.render(tree('visible', false, true)));
			await act(() => root.render(tree('hidden', false, true)));
			expect(subscribers(scope, 'value')).toBe(1);
		},
	);

	it('returns an exact inactive fallback without observing and preserves nullable live values', async () => {
		const scope = createScope({ scopeKey: 'optional-reader' });
		const value$ = scope.signal$('value', null as string | null);
		function Reader({ source }: { source: SignalHandle<string | null> | 'off' | false | null }) {
			const value = useOptionalRetainedSignalValue(source);
			return h('output', null, value === null ? 'null' : String(value));
		}
		const tree = (source: SignalHandle<string | null> | 'off' | false | null, hidden = false) =>
			h(
				RetainedSignalProvider,
				{ retainOnHide: false },
				h((React as any).Activity, { mode: hidden ? 'hidden' : 'visible' }, h(Reader, { source })),
			);
		const { root, container } = mount(tree('off'));
		expect(container.textContent).toBe('off');
		expect(subscribers(scope, 'value')).toBe(0);
		await act(() => root.render(tree(value$)));
		expect(container.textContent).toBe('null');
		expect(subscribers(scope, 'value')).toBe(1);
		await act(() => root.render(tree(value$, true)));
		expect(subscribers(scope, 'value')).toBe(0);
		await act(() => root.render(tree(value$)));
		await act(() => value$.set('live'));
		expect(container.textContent).toBe('live');
		await act(() => root.render(tree(false)));
		expect(container.textContent).toBe('false');
		expect(subscribers(scope, 'value')).toBe(0);
		await act(() => root.render(tree(null)));
		expect(container.textContent).toBe('null');
	});

	it('releases a replaced retained handle and follows changes to the retention policy', async () => {
		const scope = createScope({ scopeKey: 'retention-policy' });
		const first = scope.signal$('first', 'first');
		const second = scope.signal$('second', 'second');
		function Reader({ handle, retain }: { handle: SignalHandle<string>; retain: boolean }) {
			return h('output', null, useRetainedSignalValue(handle, undefined, retain));
		}
		const tree = (mode: 'visible' | 'hidden', handle: SignalHandle<string>, retain: boolean) =>
			h(
				React.StrictMode,
				null,
				h((React as any).Activity, { mode }, h(Reader, { handle, retain })),
			);
		const { root, container } = mount(tree('visible', first, true));
		await act(() => root.render(tree('hidden', first, true)));
		expect(subscribers(scope, 'first')).toBe(1);
		await act(() => root.render(tree('hidden', second, true)));
		await act(() => root.render(tree('visible', second, true)));
		expect(container.textContent).toBe('second');
		expect(subscribers(scope, 'first')).toBe(0);
		expect(subscribers(scope, 'second')).toBe(1);
		await act(() => root.render(tree('visible', second, false)));
		await act(() => root.render(tree('hidden', second, false)));
		expect(subscribers(scope, 'second')).toBe(0);
		await act(() => second.set('new'));
		await act(() => root.render(tree('visible', second, false)));
		expect(container.textContent).toBe('new');
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

	it('does not watch during SSR and shares one observation across hydrated React readers', async () => {
		const scope = createScope({ scopeKey: 'watched-react-hydration' });
		const log: string[] = [];
		const handle = scope.signal$('name', 'Ada', {
			watched: () => {
				log.push('watch');
				return () => log.push('unwatch');
			},
		});
		const tree = (readers: number) =>
			h(
				'div',
				null,
				Array.from({ length: readers }, (_, key) => h(Value, { key, handle })),
			);
		const container = document.createElement('div');
		container.innerHTML = renderToString(tree(2));
		const first = container.querySelector('output');
		expect(container.textContent).toBe('AdaAda');
		expect(log).toEqual([]);
		let root!: Root;
		await act(() => {
			root = hydrateRoot(container, tree(2));
		});
		roots.push(root);
		expect(container.querySelector('output')).toBe(first);
		expect(log).toEqual(['watch']);
		await act(() => root.render(tree(1)));
		expect(log).toEqual(['watch']);
		await act(() => root.unmount());
		roots.splice(roots.indexOf(root), 1);
		expect(log).toEqual(['watch', 'unwatch']);
		scope.dispose();
		expect(log).toEqual(['watch', 'unwatch']);
	});

	it('isolates overlapping streamed requests and hydrates each completed seed', async () => {
		function request(label: string, seed?: ReturnType<Scope['serialize']>) {
			const scope = createScope({ scopeKey: 'request', ...(seed ? { seed } : {}) });
			labels.set(scope, scope.signal$<unknown>('label', label));
			return scope;
		}
		// Server and client bundles have separate React context instances in practice.
		vi.resetModules();
		const server = await import('../../src/signals/react.js');
		function DeferredLabel({ gate }: { gate: Promise<void> }) {
			React.use(gate);
			return h('output', null, String(server.useSignalValue(labels.get(server.useSignalScope())!)));
		}
		const suspense = (child: React.ReactNode) =>
			h(React.Suspense, { fallback: h('p', null, 'loading') }, child);
		const serverTree = (scope: Scope, gate: Promise<void>) =>
			h(server.SignalScopeProvider, { scope }, suspense(h(DeferredLabel, { gate })));
		const clientTree = (scope: Scope) => h(SignalScopeProvider, { scope }, suspense(h(Label)));
		function stream(scope: Scope, gate: Promise<void>) {
			const shell = deferred<void>();
			const done = deferred<void>();
			const errors: unknown[] = [];
			const sink = new PassThrough();
			let html = '';
			sink.on('data', (chunk: Buffer) => (html += chunk.toString()));
			sink.on('end', () => done.resolve());
			sink.on('error', done.reject);
			const render = renderToPipeableStream(serverTree(scope, gate), {
				onShellReady: () => shell.resolve(),
				onAllReady: () => queueMicrotask(() => render.pipe(sink)),
				onShellError: (error) => {
					shell.reject(error);
					done.reject(error);
				},
				onError: (error) => {
					errors.push(error);
				},
			});
			return {
				shell: shell.promise,
				done: done.promise,
				errors,
				html: () => html,
				abort: render.abort,
			};
		}

		const first = request('first initial');
		const second = request('second initial');
		const cancelled = request('cancelled initial');
		const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
		const streams = [
			stream(first, gates[0]!.promise),
			stream(second, gates[1]!.promise),
			stream(cancelled, gates[2]!.promise),
		];
		try {
			await Promise.all(streams.map((render) => render.shell));
			let firstFinished = false;
			void streams[0]!.done.then(() => (firstFinished = true));
			const abort = new Error('request cancelled');
			streams[2]!.abort(abort);
			cancelled.dispose();
			await streams[2]!.done;
			expect(streams[2]!.errors).toEqual([abort]);
			expect([cancelled.retired, first.retired, second.retired]).toEqual([true, false, false]);

			labels.get(second)!.set('request B');
			gates[1]!.resolve();
			await streams[1]!.done;
			expect(firstFinished).toBe(false);
			labels.get(first)!.set('request A');
			gates[0]!.resolve();
			await streams[0]!.done;

			for (const [scope, render, expected, other] of [
				[first, streams[0]!, 'request A', 'request B'],
				[second, streams[1]!, 'request B', 'request A'],
			] as const) {
				expect(render.errors).toEqual([]);
				expect(render.html()).toContain(expected);
				expect(render.html()).not.toContain(other);
				const client = request('client initial', scope.serialize());
				const container = document.createElement('div');
				container.innerHTML = render.html();
				const output = container.querySelector('output');
				const errors: unknown[] = [];
				let root!: Root;
				try {
					await act(() => {
						root = hydrateRoot(container, clientTree(client), {
							onRecoverableError: (error) => errors.push(error),
						});
					});
					expect(errors).toEqual([]);
					expect(container.querySelector('output')).toBe(output);
					expect(output?.textContent).toBe(expected);
					expect(subscribers(client, 'label')).toBe(1);
					await act(() => labels.get(client)!.set(`${expected} live`));
					expect(output?.textContent).toBe(`${expected} live`);
				} finally {
					await act(() => root?.unmount());
					expect(subscribers(client, 'label')).toBe(0);
					client.dispose();
				}
			}
		} finally {
			for (const render of streams) render.abort();
			first.dispose();
			second.dispose();
			cancelled.dispose();
		}
	});

	it('hydrates from a seeded scope and keeps server requests apart', async () => {
		const greetings = new WeakMap<Scope, SignalHandle<string>>();
		const names = new WeakMap<Scope, WritableSignal<string>>();
		const requestScope = (name: string, seed?: ReturnType<Scope['serialize']>) => {
			const scope = createScope({ scopeKey: 'request', ...(seed ? { seed } : {}) });
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

	const readers = Object.entries({ useSignalValue, useRetainedSignalValue });
	it.each(readers)('%s adopts a historical snapshot before catching up', async (_, useValue) => {
		const request = createScope({ scopeKey: 'historical-request' });
		const serverName$ = request.signal$('name', 'Ada');
		function Greeting(props: {
			name$: SignalHandle<string>;
			getServerSnapshot?: () => string;
			layouts?: string[];
		}) {
			const name = useValue(props.name$, props.getServerSnapshot);
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

	it('uses the inherited historical snapshot for SSR and hydration, with explicit snapshots taking precedence', async () => {
		const scope = createScope({ scopeKey: 'provider-historical' });
		const name$ = scope.signal$('name', 'Ada');
		const seed = scope.serialize();
		const frame = scope.beginAdoption(seed);
		name$.set('Lin');
		const resolve = <T>(handle: SignalHandle<T>): T => frame.run(() => handle.get());
		function Greeting({
			explicit,
			layouts,
		}: {
			explicit?: (() => string) | undefined;
			layouts?: string[] | undefined;
		}) {
			const name = useRetainedSignalValue(name$, explicit);
			React.useLayoutEffect(() => {
				layouts?.push(name);
			}, [name, layouts]);
			return h('p', null, name);
		}
		const tree = (explicit?: () => string, layouts?: string[]) =>
			h(
				RetainedSignalProvider,
				{ getServerSnapshot: resolve },
				h(RetainedSignalProvider, { retainOnHide: false }, h(Greeting, { explicit, layouts })),
			);
		function OptionalGreeting() {
			return h('p', null, useOptionalRetainedSignalValue(name$));
		}
		expect(
			renderToString(
				h(RetainedSignalProvider, { getServerSnapshot: resolve }, h(OptionalGreeting)),
			),
		).toBe('<p>Ada</p>');
		expect(renderToString(tree(() => 'override'))).toBe('<p>override</p>');
		const container = document.createElement('div');
		container.innerHTML = renderToString(tree());
		expect(container.innerHTML).toBe('<p>Ada</p>');
		const original = container.firstChild;
		const errors: unknown[] = [];
		const layouts: string[] = [];
		let root!: Root;
		await act(() => {
			root = hydrateRoot(container, tree(undefined, layouts), {
				onRecoverableError: (error) => errors.push(error),
			});
		});
		roots.push(root);
		expect(errors).toEqual([]);
		expect(container.firstChild).toBe(original);
		expect(layouts[0]).toBe('Ada');
		expect(container.textContent).toBe('Lin');
		frame.release();
		await act(() => name$.set('Grace'));
		expect(container.textContent).toBe('Grace');
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
