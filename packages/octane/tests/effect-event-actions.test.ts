import { describe, expect, it, vi } from 'vitest';
import { createElement, createRoot, flushSync, requestFormReset, startTransition } from 'octane';
import { createScope } from 'octane/signals';
import { act, mount, nextTask } from './_helpers';
import {
	ExternalEffectEvent,
	ExternalEffectEventUpdates,
	OptimisticEffectEvent,
} from './_fixtures/effect-event-actions.tsrx';

describe('Effect Event transition ownership', () => {
	it('keeps a post-await Effect Event wrapped in a transition in the same Action as direct updates', async () => {
		const scope = createScope({ scopeKey: 'nested-effect-event-action' });
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
				await continuation;
				direct$.set(1);
				startTransition(() => event('normal'));
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

	it('reverts only the unwrapped optimistic update while an Action is pending', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		let event!: () => void;
		let add!: (value: string) => void;
		const r = mount(OptimisticEffectEvent, {
			bind: (callback, update) => {
				event = callback;
				add = update;
			},
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await act(() =>
				startTransition(() => {
					add('owned');
					return pending;
				}),
			);
			expect(r.find('output').textContent).toBe('owned');
			await act(() => {
				event();
				startTransition(() => add('owned-after'));
				event();
			});
			expect(r.find('output').textContent).toBe('owned-after');
			expect(error).toHaveBeenCalledWith(expect.stringContaining('outside a transition or action'));
			await act(() => release());
			expect(r.find('output').textContent).toBe('idle');
		} finally {
			release();
			await act(() => {});
			r.unmount();
			error.mockRestore();
		}
	});

	it('reverts an unwrapped optimistic update before the next host task', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		let event!: () => void;
		const r = mount(OptimisticEffectEvent, { bind: (callback) => (event = callback) });
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			startTransition(() => pending);
			flushSync(() => event());
			expect(r.find('output').textContent).toBe('optimistic');
			await nextTask();
			expect(r.find('output').textContent).toBe('idle');
		} finally {
			release();
			await act(() => {});
			r.unmount();
			error.mockRestore();
		}
	});

	it('resets a form immediately from an unwrapped Effect Event', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		const form = document.createElement('form');
		const input = document.createElement('input');
		input.defaultValue = 'default';
		input.value = 'changed';
		form.append(input);
		let event!: () => void;
		const r = mount(ExternalEffectEvent, {
			bind: (callback) => (event = callback),
			run: () => requestFormReset(form),
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			startTransition(() => pending);
			event();
			expect(input.value).toBe('default');
			expect(error).toHaveBeenCalledWith(expect.stringContaining('outside a transition or action'));
		} finally {
			release();
			await act(() => {});
			r.unmount();
			error.mockRestore();
		}
	});

	it('mounts and replaces an independent root synchronously from an unwrapped Effect Event', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		const container = document.createElement('div');
		const root = createRoot(container);
		let event!: () => void;
		let render = () => root.render(() => createElement('span', null, 'first'));
		const r = mount(ExternalEffectEvent, {
			bind: (callback) => (event = callback),
			run: () => render(),
		});
		try {
			startTransition(() => pending);
			event();
			expect(container.textContent).toBe('first');
			render = () => root.render(() => createElement('span', null, 'second'));
			event();
			expect(container.textContent).toBe('second');
		} finally {
			release();
			await act(() => {});
			root.unmount();
			r.unmount();
		}
	});
});
