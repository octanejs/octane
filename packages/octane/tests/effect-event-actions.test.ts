import { describe, expect, it } from 'vitest';
import {
	captureActionContext,
	createElement,
	createRoot,
	startTransition,
	useTransition,
	type ActionContext,
} from 'octane';
import { createScope } from 'octane/signals';
import { act, mount } from './_helpers';
import { ExternalEffectEventUpdates } from './_fixtures/effect-event-actions.tsrx';

describe('Effect Event transition ownership', () => {
	it('keeps a captured post-await Effect Event in the same Action as direct updates', async () => {
		const scope = createScope({ scopeKey: 'captured-effect-event-action' });
		const count$ = scope.signal$('count', 0);
		const direct$ = scope.signal$('direct', 0);
		let resume!: () => void;
		const continuation = new Promise<void>((resolve) => (resume = resolve));
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		let event!: (mode: 'normal') => void;
		const r = mount(ExternalEffectEventUpdates, {
			count$,
			pending,
			bind: (callback) => (event = callback),
		});
		try {
			startTransition(async () => {
				const context = captureActionContext();
				await continuation;
				context.run(() => {
					event('normal');
					direct$.set(1);
				});
				await pending;
			});
			await act(() => resume());
			expect(direct$.get()).toBe(0);
			expect(count$.get()).toBe(0);
			expect(r.find('output').textContent).toBe('0:0:0');
			await act(() => release());
			expect(direct$.get()).toBe(1);
			expect(count$.get()).toBe(1);
			expect(r.find('output').textContent).toBe('1:1:1');
		} finally {
			resume();
			release();
			await act(() => {});
			r.unmount();
			scope.dispose();
		}
	});

	it('revokes each Action independently and restores nested and throwing runs', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		let releaseInner!: () => void;
		const innerPending = new Promise<void>((resolve) => (releaseInner = resolve));
		let outer!: ActionContext;
		let inner!: ActionContext;
		let synchronous!: ActionContext;
		let reenteredOuter!: ActionContext;
		let restoredInner!: ActionContext;
		let restoredOuter!: ActionContext;
		try {
			expect(() => captureActionContext()).toThrow();
			startTransition(() => {
				outer = captureActionContext();
				startTransition(() => {
					inner = captureActionContext();
					reenteredOuter = outer.run(() => captureActionContext());
					restoredInner = captureActionContext();
					return innerPending;
				});
				startTransition(() => {
					synchronous = captureActionContext();
				});
				expect(() => synchronous.run(() => {})).toThrow();
				expect(() =>
					outer.run(() => {
						throw new Error('callback failed');
					}),
				).toThrow('callback failed');
				restoredOuter = captureActionContext();
				return pending;
			});
			await act(() => releaseInner());
			expect(() => inner.run(() => {})).toThrow();
			expect(() => restoredInner.run(() => {})).toThrow();
			expect(outer.run(() => 42)).toBe(42);
			expect(reenteredOuter.run(() => 43)).toBe(43);
			expect(restoredOuter.run(() => 44)).toBe(44);
			await outer.run(async () => {
				await Promise.resolve();
				expect(() => captureActionContext()).toThrow();
			});
			expect(() => captureActionContext()).toThrow();
			await act(() => release());
			let called = false;
			expect(() =>
				outer.run(() => {
					called = true;
				}),
			).toThrow();
			expect(() => reenteredOuter.run(() => {})).toThrow();
			expect(() => restoredOuter.run(() => {})).toThrow();
			expect(called).toBe(false);
		} finally {
			releaseInner();
			release();
			await act(() => {});
		}
	});

	it.each(['rejection', 'subscription failure'] as const)(
		'revokes an Action on %s',
		async (mode) => {
			const container = document.createElement('div');
			const errors: unknown[] = [];
			const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
			let begin!: (fn: () => Promise<void>) => void;
			let context!: ActionContext;
			const error = new Error('Action failed');
			try {
				root.render(() => {
					const [, start] = useTransition(Symbol.for('failed-captured-action'));
					begin = start;
					return createElement('output', null, 'ready');
				});
				await act(() =>
					begin(() => {
						context = captureActionContext();
						return mode === 'rejection'
							? Promise.reject(error)
							: ({
									then() {
										throw error;
									},
								} as unknown as Promise<void>);
					}),
				);
				expect(errors).toEqual([error]);
				expect(() => context.run(() => {})).toThrow();
			} finally {
				root.unmount();
			}
		},
	);

	it('captures a useTransition Action until that invocation settles', async () => {
		let begin!: (fn: () => Promise<void>) => void;
		let context!: ActionContext;
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		const r = mount(() => {
			const [isPending, start] = useTransition(Symbol.for('captured-action-context'));
			begin = start;
			return createElement('output', null, isPending ? 'pending' : 'idle');
		});
		try {
			await act(() =>
				begin(() => {
					context = captureActionContext();
					return pending;
				}),
			);
			expect(r.find('output').textContent).toBe('pending');
			expect(context.run(() => 42)).toBe(42);
			await act(() => release());
			expect(r.find('output').textContent).toBe('idle');
			expect(() => context.run(() => {})).toThrow();
		} finally {
			release();
			await act(() => {});
			r.unmount();
		}
	});

	it('does not let a commit callback capture its enclosing Action', () => {
		let captureError: unknown;
		let r!: ReturnType<typeof mount>;
		startTransition(() => {
			r = mount(() =>
				createElement('div', {
					ref: (node: Element | null) => {
						if (node === null) return;
						try {
							captureActionContext();
						} catch (error) {
							captureError = error;
						}
					},
				}),
			);
		});
		try {
			expect(captureError).toBeInstanceOf(Error);
		} finally {
			r.unmount();
		}
	});

	it.each(['normal', 'throw', 'transition'] as const)(
		'keeps %s event updates in their own transition context',
		async (mode) => {
			const scope = createScope({ scopeKey: `effect-event-${mode}` });
			const actionScope = createScope({ scopeKey: `unrelated-action-${mode}` });
			const count$ = scope.signal$('count', 0);
			const held$ = actionScope.signal$('held', 0);
			let release!: () => void;
			const pending = new Promise<void>((resolve) => (release = resolve));
			let event!: (kind: typeof mode) => void;
			const r = mount(ExternalEffectEventUpdates, {
				count$,
				pending,
				bind: (callback) => (event = callback),
			});
			try {
				if (mode !== 'transition') {
					startTransition(async () => {
						held$.set(1);
						await pending;
					});
					await Promise.resolve();
				}
				await act(() => {
					if (mode === 'throw') expect(() => event(mode)).toThrow('event failed');
					else event(mode);
				});
				expect(count$.get()).toBe(mode === 'transition' ? 0 : 1);
				expect(r.find('output').textContent).toBe(mode === 'transition' ? '0:0:0' : '1:1:1');
				if (mode !== 'transition') {
					held$.set(2);
					expect(held$.get()).toBe(0);
					actionScope.dispose();
				}
				await act(() => release());
				expect(count$.get()).toBe(1);
				expect(r.find('output').textContent).toBe('1:1:1');
			} finally {
				release();
				await act(() => {});
				r.unmount();
				actionScope.dispose();
				scope.dispose();
			}
		},
	);
});
