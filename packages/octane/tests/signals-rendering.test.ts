import { describe, expect, it, vi } from 'vitest';
import {
	createRoot,
	flushSync,
	getTransitionFallbackTimeout,
	setTransitionFallbackTimeout,
	startTransition,
} from 'octane';
import { act, createLog, flushEffects, mount } from './_helpers';
import {
	createCounter$,
	createResource$,
	DerivedReader,
	EventWrites,
	ImportedReader,
	MemoParent,
	NativeActivity,
	NativeAsyncBoundary,
	NativeAsyncValue,
	NativeDeletionRace,
	NativeDetachedErrorCleanup,
	NativeErrorBoundary,
	NativeHeldBoundary,
	NativeHeldIsolation,
	NativeHeldSiblings,
	NativeNestedHeldSiblings,
	NativeRows,
	NativeStablePublication,
	NativeSupersessionReader,
	NativeTimedCleanup,
	RenderWriter,
	SampledEffects,
	SignalReader,
	ThrowingReader,
} from './_fixtures/signals-native.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('native signal rendering', () => {
	it('updates a direct reader while writes remain immediately readable', () => {
		const state = createCounter$('direct', 1);
		const rendered = mount(SignalReader, state);
		try {
			const node = rendered.find('.signal-value');
			expect(node.textContent).toBe('1');
			flushSync(() => {
				state.scope.set(state.count$, 7);
				expect(state.scope.get(state.count$)).toBe(7);
			});
			expect(rendered.find('.signal-value')).toBe(node);
			expect(node.textContent).toBe('7');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('refreshes derived values and reads hidden inside an imported helper', () => {
		const state = createCounter$('derived', 2);
		const derived = mount(DerivedReader, state);
		const imported = mount(ImportedReader, state);
		try {
			expect(derived.find('.signal-value').textContent).toBe('4');
			expect(imported.find('.signal-value').textContent).toBe('value:2');
			flushSync(() => state.scope.set(state.count$, 5));
			expect(derived.find('.signal-value').textContent).toBe('10');
			expect(imported.find('.signal-value').textContent).toBe('value:5');
			imported.update(ImportedReader, state);
			flushSync(() => state.scope.set(state.count$, 6));
			expect(imported.find('.signal-value').textContent).toBe('value:6');
		} finally {
			derived.unmount();
			imported.unmount();
			state.scope.dispose();
		}
	});

	it('keeps shared data alive when one consuming root unmounts', () => {
		const state = createCounter$('shared', 3);
		const first = mount(SignalReader, state);
		const second = mount(SignalReader, state);
		try {
			first.unmount();
			flushSync(() => state.scope.set(state.count$, 8));
			expect(first.container.textContent).toBe('');
			expect(second.find('.signal-value').textContent).toBe('8');
			expect(state.scope.get(state.count$)).toBe(8);
		} finally {
			first.unmount();
			second.unmount();
			state.scope.dispose();
		}
	});

	it('updates a memoized reader after its parent rendered with unchanged data', () => {
		const state = createCounter$('memo', 1);
		const rendered = mount(MemoParent, { ...state, label: 'before' });
		try {
			const reader = rendered.find('.signal-value');
			rendered.update(MemoParent, { ...state, label: 'after' });
			flushSync(() => state.scope.set(state.count$, 9));
			expect(rendered.find('.label').textContent).toBe('after');
			expect(rendered.find('.signal-value')).toBe(reader);
			expect(reader.textContent).toBe('9');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('preserves keyed survivors and keeps cleared consumers absent', () => {
		const state = createCounter$('rows', 4);
		const rendered = mount(NativeRows, { ...state, rows: [1, 2, 3] });
		try {
			const first = rendered.find('[data-row="1"]');
			const second = rendered.find('[data-row="2"]');
			const survivor = rendered.find('.survivor');
			rendered.update(NativeRows, { ...state, rows: [3, 2, 1] });
			flushSync(() => state.scope.set(state.count$, 5));
			expect(rendered.find('[data-row="1"]')).toBe(first);
			expect(rendered.find('[data-row="2"]')).toBe(second);
			expect(rendered.findAll('[data-row]').map((node) => node.textContent)).toEqual([
				'5',
				'5',
				'5',
			]);
			rendered.update(NativeRows, { ...state, rows: [] });
			flushSync(() => state.scope.set(state.count$, 6));
			expect(rendered.findAll('[data-row]')).toEqual([]);
			expect(rendered.find('.survivor')).toBe(survivor);
			expect(survivor.textContent).toBe('keep');
			expect(state.scope.get(state.count$)).toBe(6);
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('passes sampled render values to the existing layout and passive effects', () => {
		const state = createCounter$('effects');
		const log = createLog();
		const rendered = mount(SampledEffects, { ...state, log: log.push });
		try {
			flushEffects();
			expect(log.drain()).toEqual(['layout:0:0', 'passive:0:0']);
			flushSync(() => state.scope.set(state.count$, 2));
			flushEffects();
			expect(rendered.find('output').textContent).toBe('2');
			expect(log.drain()).toEqual([
				'layout-cleanup:0',
				'layout:2:2',
				'passive-cleanup:0',
				'passive:2:2',
			]);
		} finally {
			rendered.unmount();
			flushEffects();
			state.scope.dispose();
		}
	});

	it('rejects render-phase writes without leaking the guard into imperative code', () => {
		const state = createCounter$('render-write');
		try {
			expect(() => mount(RenderWriter, state)).toThrow(/write|render/i);
			expect(state.scope.get(state.count$)).toBe(0);
			expect(() => state.scope.set(state.count$, 7)).not.toThrow();
			expect(state.scope.get(state.count$)).toBe(7);
		} finally {
			state.scope.dispose();
		}
	});

	it('restores native read context when a component throws', () => {
		const state = createCounter$('throw');
		try {
			expect(() => mount(ThrowingReader, state)).toThrow('native fixture failure');
			expect(() => state.scope.set(state.count$, 11)).not.toThrow();
			const rendered = mount(SignalReader, state);
			try {
				flushSync(() => state.scope.set(state.count$, 12));
				expect(rendered.find('.signal-value').textContent).toBe('12');
			} finally {
				rendered.unmount();
			}
		} finally {
			state.scope.dispose();
		}
	});

	it('batches native capture and bubble handlers while reads see each write immediately', () => {
		const state = createCounter$('event');
		const log = createLog();
		const rendered = mount(EventWrites, { ...state, log: log.push });
		const unsubscribe = state.count$.subscribe(() =>
			log.push('notify:' + state.scope.get(state.count$)),
		);
		try {
			// Do not use the helper's flushSync wrapper: the native event owns this batch.
			(rendered.find('button') as HTMLButtonElement).click();
			expect(log.drain()).toEqual(['capture:1', 'child:2', 'parent:3', 'notify:3']);
			expect(rendered.find('button').textContent).toBe('3');
		} finally {
			unsubscribe();
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('retries a discarded first mount when its pending request key changes', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const started: string[] = [];
		const state = createResource$('root-retry', (key) => {
			started.push(key);
			return key === 'a' ? first.promise : second.promise;
		});
		const rendered = mount(NativeAsyncValue, state);
		try {
			expect(rendered.container.textContent).toBe('');
			expect(started).toEqual(['a']);
			await act(() => state.scope.set(state.key$, 'b'));
			expect(started).toEqual(['a', 'b']);
			await act(() => second.resolve('new'));
			expect(rendered.find('.async-value').textContent).toBe('new');
			await act(() => first.resolve('obsolete'));
			expect(rendered.find('.async-value').textContent).toBe('new');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('can leave a pending boundary before its obsolete request settles', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const state = createResource$('boundary-retry', (key) =>
			key === 'a' ? first.promise : second.promise,
		);
		const rendered = mount(NativeAsyncBoundary, state);
		try {
			expect(rendered.find('.pending').textContent).toBe('loading');
			await act(() => state.scope.set(state.key$, 'b'));
			await act(() => second.resolve('new'));
			expect(rendered.findAll('.pending')).toEqual([]);
			expect(rendered.find('.async-value').textContent).toBe('new');
			await act(() => first.resolve('obsolete'));
			expect(rendered.find('.async-value').textContent).toBe('new');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('keeps an accepted panel coherent while a replacement suspends', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const state = createResource$('held', (key) => (key === 'a' ? first.promise : second.promise));
		const rendered = mount(NativeHeldBoundary, state);
		try {
			await act(() => first.resolve('old'));
			const panel = rendered.find('.panel');
			await act(() =>
				startTransition(() =>
					state.scope.batch(() => {
						state.scope.set(state.count$, 1);
						state.scope.set(state.key$, 'b');
					}),
				),
			);
			expect(rendered.find('.panel')).toBe(panel);
			expect(rendered.find('.count').textContent).toBe('0');
			expect(rendered.find('.async-value').textContent).toBe('old');
			await act(() => state.scope.set(state.count$, 2));
			expect(rendered.find('.count').textContent).toBe('0');
			expect(state.scope.get(state.count$)).toBe(2);
			await act(() => second.resolve('new'));
			expect(rendered.find('.panel')).toBe(panel);
			expect(rendered.find('.count').textContent).toBe('2');
			expect(rendered.find('.async-value').textContent).toBe('new');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	for (const [label, Reader] of [
		['sibling', NativeHeldSiblings],
		['nested sibling', NativeNestedHeldSiblings],
	] as const)
		it(`holds an independently scheduled ${label} and publishes only completed refs and effects`, async () => {
			const first = deferred<string>();
			const second = deferred<string>();
			const state = createResource$('held-' + label, (key) =>
				key === 'a' ? first.promise : second.promise,
			);
			const log = createLog();
			const rendered = mount(Reader, { ...state, log: log.push });
			try {
				await act(() => first.resolve('old'));
				const panel = rendered.find('.panel');
				const button = rendered.find('.count') as HTMLButtonElement;
				button.focus();
				log.clear();
				await act(() =>
					startTransition(() =>
						state.scope.batch(() => {
							state.count$.set(1);
							state.key$.set('b');
						}),
					),
				);
				expect(rendered.find('.panel')).toBe(panel);
				expect(rendered.find('.count')).toBe(button);
				expect(button.textContent).toBe('0');
				expect(rendered.find('.async-value').textContent).toBe('old');
				expect(log.drain()).toEqual([]);
				await act(() => state.count$.set(2));
				expect(button.textContent).toBe('0');
				expect(log.drain()).toEqual([]);
				await act(() => second.resolve('new'));
				expect(rendered.find('.panel')).toBe(panel);
				expect(rendered.find('.count')).toBe(button);
				expect(document.activeElement).toBe(button);
				expect(button.textContent).toBe('2');
				expect(rendered.find('.async-value').textContent).toBe('new');
				const accepted = log.drain();
				expect(accepted.filter((entry) => entry.startsWith('layout:'))).toEqual(['layout:2']);
				expect(accepted).toContain('ref:2:attach');
				expect(accepted).toContain('cleanup:0');
			} finally {
				rendered.unmount();
				expect(state.scope.inspect().nodes.find((node) => node.key === 'count')?.subscribers).toBe(
					0,
				);
				state.scope.dispose();
			}
		});

	it('keeps unrelated urgent updates live while a native primary holds a transition', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const state = createResource$('held-isolation', (key) =>
			key === 'a' ? first.promise : second.promise,
		);
		const outside = createCounter$('held-outside');
		const log = createLog();
		const rendered = mount(NativeHeldIsolation, { ...state, outside, log: log.push });
		try {
			await act(() => first.resolve('old'));
			const panel = rendered.find('.panel');
			log.clear();
			await act(() => {
				startTransition(() =>
					state.scope.batch(() => {
						state.count$.set(1);
						state.key$.set('b');
					}),
				);
				outside.count$.set(1);
			});
			expect(rendered.find('.panel')).toBe(panel);
			expect(rendered.find('.panel .count').textContent).toBe('0');
			expect(rendered.find('.outside .count').textContent).toBe('1');
			expect(log.drain().filter((entry) => !entry.startsWith('outside:'))).toEqual([]);
			await act(() => {
				outside.count$.set(2);
				state.count$.set(2);
			});
			expect(rendered.find('.panel .count').textContent).toBe('0');
			expect(rendered.find('.outside .count').textContent).toBe('2');
			expect(log.drain().filter((entry) => !entry.startsWith('outside:'))).toEqual([]);
			await act(() => second.resolve('new'));
			expect(rendered.find('.panel')).toBe(panel);
			expect(rendered.find('.panel .count').textContent).toBe('2');
			expect(rendered.find('.async-value').textContent).toBe('new');
			expect(rendered.find('.outside .count').textContent).toBe('2');
		} finally {
			rendered.unmount();
			state.scope.dispose();
			outside.scope.dispose();
		}
	});

	it('updates native consumers under hidden Activity without replacing their hosts', () => {
		const state = createCounter$('activity', 1);
		const rendered = mount(NativeActivity, { ...state, hidden: false });
		try {
			const host = rendered.find('.signal-value') as HTMLElement;
			rendered.update(NativeActivity, { ...state, hidden: true });
			flushSync(() => state.scope.set(state.count$, 4));
			expect(rendered.find('.signal-value')).toBe(host);
			expect(host.style.display).toBe('none');
			rendered.update(NativeActivity, { ...state, hidden: false });
			expect(rendered.find('.signal-value')).toBe(host);
			expect(host.textContent).toBe('4');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('does not reset a committed error boundary when a retried resource becomes ready', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		let attempt = 0;
		const state = createResource$('boundary-reset', () =>
			attempt++ === 0 ? first.promise : second.promise,
		);
		const rendered = mount(NativeErrorBoundary, state);
		try {
			await act(() => first.reject(new Error('request failed')));
			const caught = rendered.find('.caught');
			await act(() => state.value$.retry());
			await act(() => second.resolve('recovered'));
			expect(rendered.find('.caught')).toBe(caught);
			expect(rendered.findAll('.async-value')).toEqual([]);
			rendered.click('.caught');
			expect(rendered.findAll('.caught')).toEqual([]);
			expect(rendered.find('.async-value').textContent).toBe('recovered');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('treats deletion cleanup writes as a later transaction after accepting sampled values', () => {
		const state = createCounter$('deletion');
		const log = createLog();
		const rendered = mount(NativeDeletionRace, { ...state, show: true, log: log.push });
		try {
			expect(log.drain()).toEqual(['commit:0:0:live:0']);
			rendered.update(NativeDeletionRace, { ...state, show: false, log: log.push });
			expect(rendered.findAll('.deleted')).toEqual([]);
			expect(rendered.find('output').textContent).toBe('1');
			expect(log.drain()).toEqual(['commit:0:0:live:1', 'commit:1:1:live:1']);
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	for (const phase of ['ref', 'layout'] as const) {
		it(`cancels remaining native publication after a ${phase} supersedes the root`, () => {
			const state = createCounter$('native-supersession-' + phase, 1);
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container);
			const log: string[] = [];
			const props = {
				...state,
				phase,
				label: 'A',
				log: (entry: string) => {
					log.push(entry);
				},
				replace: (): void => root.render(NativeSupersessionReader, { ...props, label: 'B' }),
			};
			try {
				root.render(NativeSupersessionReader, props);
				flushSync(() => {});
				expect(container.textContent).toBe('B:1B:1');
				const afterReplacement = log.slice(log.indexOf(phase + '-first:A:1') + 1);
				expect(afterReplacement.filter((entry) => entry.includes(':A:'))).toEqual([]);
				expect(log).toContain('layout-second:B:1');
				flushSync(() => state.scope.set(state.count$, 2));
				expect(container.textContent).toBe('B:2B:2');
			} finally {
				root.unmount();
				container.remove();
				state.scope.dispose();
			}
		});
	}

	it('continues accepted ref and layout callbacks after an ordinary signal write', () => {
		const state = createCounter$('native-accepted-ref-write', 1);
		const log: string[] = [];
		const rendered = mount(NativeSupersessionReader, {
			...state,
			label: 'A',
			phase: 'write',
			log: (entry) => {
				log.push(entry);
			},
			replace: () => {},
		});
		try {
			expect(log.slice(0, 4)).toEqual([
				'ref-first:A:1',
				'ref-second:A:1',
				'layout-first:A:1',
				'layout-second:A:1',
			]);
			expect(rendered.container.textContent).toBe('A:2A:2');
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	for (const kind of ['callback', 'object'] as const) {
		it(`publishes a skipped stable ${kind} ref and unchanged-deps setup on the surviving render`, () => {
			const state = createCounter$('native-stable-publication-' + kind, 1);
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container);
			const log: string[] = [];
			const refs: string[] = [];
			let current: HTMLSpanElement | null = null;
			const attach = (node: HTMLSpanElement | null) => {
				current = node;
				refs.push(node === null ? 'detach' : 'attach');
			};
			const stableRef =
				kind === 'callback'
					? attach
					: {
							get current() {
								return current;
							},
							set current(node: HTMLSpanElement | null) {
								attach(node);
							},
						};
			const props = {
				...state,
				label: 'A',
				stableRef,
				log: (entry: string) => {
					log.push(entry);
				},
				replace: (): void => root.render(NativeStablePublication, { ...props, label: 'B' }),
			};
			try {
				root.render(NativeStablePublication, props);
				flushSync(() => {});
				const host = container.querySelector('.stable-ref');
				expect(current).toBe(host);
				expect(refs).toEqual(['attach']);
				expect(log).toEqual(['setup:B']);
				flushSync(() => root.render(NativeStablePublication, { ...props, label: 'C' }));
				expect(container.querySelector('.stable-ref')).toBe(host);
				expect(current).toBe(host);
				expect(refs).toEqual(['attach']);
				expect(log).toEqual(['setup:B']);
				root.unmount();
				expect(current).toBeNull();
				expect(refs).toEqual(['attach', 'detach']);
				expect(log).toEqual(['setup:B', 'cleanup:B']);
			} finally {
				root.unmount();
				container.remove();
				state.scope.dispose();
			}
		});
	}

	it('accepts a detached error fallback before outgoing cleanup writes', async () => {
		const pending = deferred<string>();
		const state = createResource$('detached-error-cleanup', () => pending.promise);
		const log = createLog();
		const rendered = mount(NativeDetachedErrorCleanup, { ...state, log: log.push });
		try {
			await act(() => pending.reject(new Error('expected native failure')));
			expect(rendered.find('output').textContent).toBe('1');
			expect(log.drain()).toEqual(['0:0:1', '1:1:1']);
		} finally {
			rendered.unmount();
			state.scope.dispose();
		}
	});

	it('accepts a timed pending fallback before primary cleanup writes', async () => {
		const previousTimeout = getTransitionFallbackTimeout();
		vi.useFakeTimers();
		setTransitionFallbackTimeout(100);
		const first = deferred<string>();
		const second = deferred<string>();
		const state = createResource$('timed-fallback-cleanup', (key) =>
			key === 'a' ? first.promise : second.promise,
		);
		const log = createLog();
		const refs: string[] = [];
		let rendered: ReturnType<typeof mount> | undefined;
		try {
			await act(() => first.resolve('ready'));
			rendered = mount(NativeTimedCleanup, {
				...state,
				log: log.push,
				hostRef: (node: HTMLParagraphElement | null) => {
					refs.push(node === null ? 'detach' : 'attach');
				},
			});
			const primary = rendered.find('.cleanup-primary') as HTMLElement;
			await act(() => startTransition(() => state.scope.set(state.key$, 'b')));
			expect(rendered.findAll('output')).toEqual([]);
			await act(() => vi.advanceTimersByTime(150));
			expect(rendered.find('.cleanup-primary')).toBe(primary);
			expect(primary.style.display).toBe('none');
			expect(rendered.find('output').textContent).toBe('1');
			expect(log.drain()).toEqual(['0:0:1', '1:1:1']);
			expect(refs).toEqual(['attach', 'detach']);
			await act(() => second.reject(new Error('expected hidden failure')));
			expect(rendered.find('.caught').textContent).toBe('caught');
			expect(refs).toEqual(['attach', 'detach']);
		} finally {
			rendered?.unmount();
			state.scope.dispose();
			setTransitionFallbackTimeout(previousTimeout);
			vi.useRealTimers();
		}
	});
});
