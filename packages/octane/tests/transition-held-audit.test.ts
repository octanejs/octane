import { describe, it, expect } from 'vitest';
import { mount, act, createLog } from './_helpers';
import { startTransition } from '../src/index.js';
import {
	NestedHeldBoundary,
	ErrorWhileHeld,
	RapidTransitions,
	EffectOrdering,
} from './_fixtures/transition-held-audit.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function setup() {
	let value = 1;
	const listeners = new Set<() => void>();
	const pending = [deferred<number>(), deferred<number>(), deferred<number>()];
	const ready = { status: 'fulfilled', value: 1, then() {} } as unknown as PromiseLike<number>;
	const store = {
		get: () => value,
		setUrgent: (next: number) => {
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return {
		store,
		pending,
		promiseFor: (value: number) => (value === 1 ? ready : pending[value - 2].promise),
	};
}

describe('external-store suspense across transitions', () => {
	it('shows only the nearest fallback and ignores stale resolutions', async () => {
		const { store, pending, promiseFor } = setup();
		let start!: (fn: () => void) => void;
		const root = mount(NestedHeldBoundary, {
			store,
			promiseFor,
			bindStart: (value: typeof start) => {
				start = value;
			},
		});
		try {
			await act(() => {});
			const outer = root.find('#outer-content');
			await act(() => start(() => store.setUrgent(2)));
			expect(root.find('#inner-fallback').textContent).toBe('inner-fallback');
			expect(root.findAll('#outer-fallback')).toHaveLength(0);
			await act(() => store.setUrgent(3));
			await act(() => pending[0].resolve(2));
			expect(root.findAll('#inner-fallback')).toHaveLength(1);
			await act(() => pending[1].resolve(3));
			expect(root.find('#inner-content').textContent).toBe('inner-3');
			expect(root.find('#outer-content')).toBe(outer);
			expect(root.findAll('#inner-fallback')).toHaveLength(0);
			expect(root.findAll('#outer-fallback')).toHaveLength(0);
			expect(root.find('#pending').textContent).toBe('idle');
		} finally {
			root.unmount();
		}
	});

	it.each([-1, -5])('routes an error after suspension to the boundary (%i)', async (value) => {
		const { store, pending, promiseFor } = setup();
		let start!: (fn: () => void) => void;
		const root = mount(ErrorWhileHeld, {
			store,
			promiseFor,
			bindStart: (value: typeof start) => {
				start = value;
			},
		});
		try {
			await act(() => {});
			await act(() => start(() => store.setUrgent(2)));
			expect(root.findAll('#fallback')).toHaveLength(1);
			await act(() => store.setUrgent(value));
			expect(root.find('#error').textContent).toBe('error:boom-' + -value);
			expect(root.findAll('#content')).toHaveLength(0);
			expect(root.findAll('#fallback')).toHaveLength(0);
			await act(() => pending[0].resolve(2));
			expect(root.find('#error').textContent).toBe('error:boom-' + -value);
			expect(root.find('#pending').textContent).toBe('idle');
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])(
		'reveals only the latest store value across rapid updates (mixed: %s)',
		async (mixed) => {
			const { store, pending, promiseFor } = setup();
			const root = mount(RapidTransitions, { store, promiseFor });
			try {
				await act(() => {});
				await act(() => startTransition(() => store.setUrgent(2)));
				await act(() => (mixed ? store.setUrgent(3) : startTransition(() => store.setUrgent(3))));
				await act(() => startTransition(() => store.setUrgent(4)));
				expect(root.findAll('#fallback')).toHaveLength(1);
				expect(root.find('#pending').textContent).toBe('idle');
				await act(() => {
					pending[0].resolve(2);
					pending[1].resolve(3);
				});
				expect(root.findAll('#fallback')).toHaveLength(1);
				await act(() => pending[2].resolve(4));
				expect(root.find('#content').textContent).toBe('content-4');
				expect(root.findAll('#fallback')).toHaveLength(0);
			} finally {
				root.unmount();
			}
		},
	);

	it('retains passive subscriptions while hidden and publishes only the resolved value', async () => {
		const { store, pending, promiseFor } = setup();
		const log = createLog();
		let start!: (fn: () => void) => void;
		const root = mount(EffectOrdering, {
			store,
			promiseFor,
			log: log.push,
			bindStart: (value: typeof start) => {
				start = value;
			},
		});
		try {
			await act(() => {});
			expect(log.drain()).toEqual(['mount-1']);
			await act(() => start(() => store.setUrgent(2)));
			await act(() => store.setUrgent(3));
			await act(() => pending[0].resolve(2));
			expect(log.drain()).toEqual([]);
			await act(() => pending[1].resolve(3));
			expect(root.find('#content').textContent).toBe('content-3');
			expect(log.drain()).toEqual(['cleanup-1', 'mount-3']);
		} finally {
			root.unmount();
		}
		expect(log.drain()).toEqual(['cleanup-3']);
	});
});
