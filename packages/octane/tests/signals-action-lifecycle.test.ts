import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, createRoot, flushSync, startTransition } from 'octane';

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, failed) => {
		resolve = done;
		reject = failed;
	});
	return { promise, resolve, reject };
}

async function pendingAction() {
	const ready = deferred<{
		scope: import('octane/signals').Scope;
		count: import('octane/signals').WritableSignal<number>;
		notifications: number[];
		synchronousCount: number;
		synchronousDoubled: number;
		stop(): void;
	}>();
	const release = deferred<void>();
	let action!: Promise<void>;
	startTransition(() => {
		action = (async () => {
			let scope: import('octane/signals').Scope | undefined;
			let stop: (() => void) | undefined;
			try {
				// The renderer Action starts before the signal engine is imported.
				const { createScope } = await import('octane/signals');
				scope = createScope({ scopeKey: 'late-action-owner' });
				const count = scope.signal$('count', 0);
				const doubled = scope.derived$('doubled', () => count.get() * 2);
				const notifications: number[] = [];
				stop = count.subscribe(() => notifications.push(count.get()));
				let synchronousCount!: number;
				let synchronousDoubled!: number;
				startTransition(() => {
					count.set(2);
					synchronousCount = count.get();
					synchronousDoubled = doubled.get();
				});
				ready.resolve({ scope, count, notifications, synchronousCount, synchronousDoubled, stop });
				await release.promise;
			} catch (error) {
				stop?.();
				scope?.dispose();
				release.resolve();
				ready.reject(error);
				throw error;
			}
		})();
		return action;
	});
	let state: Awaited<typeof ready.promise>;
	try {
		state = await ready.promise;
	} catch (error) {
		release.resolve();
		try {
			await act(() => action);
		} finally {
			throw error;
		}
	}
	return {
		...state,
		finish: () =>
			act(() => {
				release.resolve();
				return action;
			}),
	};
}

describe('native signal Action lifetimes', () => {
	describe('signals imported during a pending Action', () => {
		let state: Awaited<ReturnType<typeof pendingAction>> | undefined;
		beforeAll(async () => {
			state = await pendingAction();
		});
		afterAll(async () => {
			if (state === undefined) return;
			try {
				await state.finish();
			} finally {
				state.stop();
				state.scope.dispose();
			}
		});
		it('admits signals loaded after an Action awaits and publishes only when it settles', async () => {
			const action = state!;
			expect(action.synchronousCount).toBe(2);
			expect(action.synchronousDoubled).toBe(4);
			expect(action.count.get()).toBe(0);
			expect(action.notifications).toEqual([]);
			await action.finish();
			expect(action.count.get()).toBe(2);
			expect(action.notifications).toEqual([2]);
		});
	});

	it('keeps an urgent replacement when the earlier Action finishes', async () => {
		const state = await pendingAction();
		try {
			expect(state.synchronousCount).toBe(2);
			expect(state.synchronousDoubled).toBe(4);
			flushSync(() => state.count.set(7));
			expect(state.count.get()).toBe(7);
			expect(state.notifications).toEqual([7]);
			await state.finish();
			expect(state.count.get()).toBe(7);
			expect(state.notifications).toEqual([7]);
		} finally {
			await state.finish();
			state.stop();
			state.scope.dispose();
		}
	});

	it('preserves chronological functional edits across an urgent update', async () => {
		const state = await pendingAction();
		try {
			expect(state.synchronousCount).toBe(2);
			expect(state.synchronousDoubled).toBe(4);
			flushSync(() => state.count.set((value) => value + 3));
			expect(state.count.get()).toBe(3);
			expect(state.notifications).toEqual([3]);
			await state.finish();
			expect(state.count.get()).toBe(5);
			expect(state.notifications).toEqual([3, 5]);
		} finally {
			await state.finish();
			state.stop();
			state.scope.dispose();
		}
	});

	it('retires pending owner work without publishing after disposal', async () => {
		const state = await pendingAction();
		try {
			expect(state.synchronousCount).toBe(2);
			expect(state.synchronousDoubled).toBe(4);
			state.scope.dispose();
			await state.finish();
			expect(state.notifications).toEqual([]);
			expect(() => state.count.get()).toThrow(/disposed/i);
		} finally {
			await state.finish();
			state.stop();
			state.scope.dispose();
		}
	});

	it('commits handles received through props without a consumer signals import', async () => {
		const { createScope } = await import('octane/signals');
		const scope = createScope({ scopeKey: 'forwarded-props-owner' });
		const count = scope.signal$('count', 0);
		const release = deferred<void>();
		let action: Promise<void> | undefined;
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let stopView: (() => void) | undefined;
		try {
			const { SignalHandleProps } = await import('./_fixtures/signal-handle-props.js');
			root.render(SignalHandleProps, { value: count });
			const input = container.querySelector('input')!;
			const output = container.querySelector('output')!;
			expect(input).not.toBeNull();
			expect(output).not.toBeNull();
			const view = () => [input.value, output.textContent, output.getAttribute('data-count')];
			const acceptedViews: Array<Array<string | null>> = [];
			stopView = count.subscribe(() => acceptedViews.push(view()));
			expect(view()).toEqual(['0', '0', '0']);
			startTransition(() => {
				action = (async () => {
					count.set(2);
					await release.promise;
				})();
				return action;
			});
			expect(view()).toEqual(['0', '0', '0']);
			expect(acceptedViews).toEqual([]);
			await act(() => {
				release.resolve();
				return action;
			});
			expect(view()).toEqual(['2', '2', '2']);
			expect(acceptedViews).toEqual([['2', '2', '2']]);
			flushSync(() => count.set(5));
			expect(container.querySelector('input')).toBe(input);
			expect(container.querySelector('output')).toBe(output);
			expect(view()).toEqual(['5', '5', '5']);
			root.unmount();
			flushSync(() => count.set(6));
			expect(view()).toEqual(['5', '5', '5']);
		} finally {
			stopView?.();
			await act(() => {
				release.resolve();
				return action;
			});
			root.unmount();
			container.remove();
			scope.dispose();
		}
	});

	it('holds form Action model and DOM updates until its awaited work settles', async () => {
		const { createScope } = await import('octane/signals');
		const scope = createScope({ scopeKey: 'form-action-owner' });
		const count = scope.signal$('count', 0);
		const entered = deferred<void>();
		const resumed = deferred<void>();
		const release = deferred<void>();
		const settle = deferred<void>();
		let action: Promise<void> | undefined;
		let callbackError: unknown;
		let submitted: FormDataEntryValue | null | undefined;
		let synchronousRead: number | undefined;
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let stopView: (() => void) | undefined;
		try {
			const { SignalHandleForm } = await import('./_fixtures/signal-handle-props.js');
			root.render(SignalHandleForm, {
				value: count,
				action(data: FormData) {
					action = (async () => {
						submitted = data.get('count');
						count.set(2);
						synchronousRead = count.get();
						entered.resolve();
						await release.promise;
						count.set(5);
						resumed.resolve();
						await settle.promise;
					})();
					action.catch((error) => {
						callbackError = error;
						entered.resolve();
						resumed.resolve();
					});
					return action;
				},
			});
			const form = container.querySelector('form')!;
			const input = container.querySelector('input')!;
			const display = container.querySelector('span')!;
			const button = container.querySelector('button')!;
			const view = () => [count.get(), input.value, display.textContent];
			const acceptedViews: Array<Array<number | string | null>> = [];
			stopView = count.subscribe(() => acceptedViews.push(view()));
			expect(view()).toEqual([0, '0', '0']);
			flushSync(() => {
				form.dispatchEvent(
					new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button }),
				);
			});
			await entered.promise;
			expect(callbackError).toBeUndefined();
			expect(submitted).toBe('0');
			expect(synchronousRead).toBe(2);
			expect(view()).toEqual([0, '0', '0']);
			expect(acceptedViews).toEqual([]);
			release.resolve();
			await resumed.promise;
			expect(callbackError).toBeUndefined();
			expect(view()).toEqual([0, '0', '0']);
			expect(acceptedViews).toEqual([]);
			await act(() => {
				settle.resolve();
				return action;
			});
			expect(view()).toEqual([5, '5', '5']);
			expect(acceptedViews).toEqual([[5, '5', '5']]);
			expect(container.querySelector('form')).toBe(form);
			expect(container.querySelector('input')).toBe(input);
			expect(container.querySelector('span')).toBe(display);
			expect(container.querySelector('button')).toBe(button);
			root.unmount();
			flushSync(() => count.set(7));
			expect([input.value, display.textContent]).toEqual(['5', '5']);
		} finally {
			stopView?.();
			await act(() => {
				release.resolve();
				settle.resolve();
				return action;
			});
			root.unmount();
			container.remove();
			scope.dispose();
		}
	});
});
