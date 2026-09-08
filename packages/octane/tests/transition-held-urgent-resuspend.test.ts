import { describe, it, expect } from 'vitest';
import { mount, act } from './_helpers';
import {
	HeldUrgentResuspend,
	HeldUrgentBodyResuspend,
	HeldStateUrgentResuspend,
	FreshUrgentSuspend,
} from './_fixtures/transition-held-urgent-resuspend.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function makeRegistry() {
	const d2 = deferred<number>();
	const d3 = deferred<number>();
	const ready = { status: 'fulfilled', value: 1, then() {} } as unknown as PromiseLike<number>;
	return {
		promiseFor: (value: number) => (value === 1 ? ready : value === 2 ? d2.promise : d3.promise),
		d2,
		d3,
	};
}
function makeStore() {
	let value = 1;
	const listeners = new Set<() => void>();
	return {
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
}

// React 19.2.7 shows the nearest fallback when an urgent update supersedes a
// suspended transition; external-store notifications are always urgent.
describe('urgent updates supersede suspended transitions', () => {
	it.each([2, 3])('preserves child state when request %i settles first', async (first) => {
		const { promiseFor, d2, d3 } = makeRegistry();
		let transition!: (value: number) => void;
		let urgent!: (value: number) => void;
		const root = mount(HeldStateUrgentResuspend, {
			promiseFor,
			bindSetters: (a, b) => {
				transition = a;
				urgent = b;
			},
		});
		const content = root.find('#content') as HTMLElement;
		try {
			await act(() => transition(2));
			expect(root.findAll('#fallback')).toHaveLength(0);
			await act(() => urgent(3));
			expect(root.find('#content')).toBe(content);
			expect(content.style.display).toBe('none');
			expect(root.find('#fallback').textContent).toBe('fallback');
			await act(() => (first === 2 ? d2 : d3).resolve(first));
			expect(root.findAll('#fallback')).toHaveLength(first === 2 ? 1 : 0);
			await act(() => (first === 2 ? d3 : d2).resolve(first === 2 ? 3 : 2));
			expect(root.find('#content')).toBe(content);
			expect(content.textContent).toBe('content-3');
			expect(content.style.display).toBe('');
			expect(root.findAll('#fallback')).toHaveLength(0);
			expect(root.find('#pending').textContent).toBe('idle');
		} finally {
			root.unmount();
		}
	});

	it.each([HeldUrgentResuspend, HeldUrgentBodyResuspend])(
		'shows fallback for external-store writes in %s',
		async (Fixture) => {
			const { promiseFor, d2, d3 } = makeRegistry();
			const store = makeStore();
			let start!: (fn: () => void) => void;
			const root = mount(Fixture, {
				promiseFor,
				store,
				bindStart: (value: typeof start) => {
					start = value;
				},
			});
			try {
				await act(() => {});
				await act(() => start(() => store.setUrgent(2)));
				expect(root.find('#fallback').textContent).toBe('fallback');
				expect(root.find('#pending').textContent).toBe('idle');
				await act(() => store.setUrgent(3));
				await act(() => d2.resolve(2));
				expect(root.find('#fallback').textContent).toBe('fallback');
				await act(() => d3.resolve(3));
				expect(root.find('#content').textContent).toBe('content-3');
				expect(root.findAll('#fallback')).toHaveLength(0);
			} finally {
				root.unmount();
			}
		},
	);

	it('shows the fallback for a fresh urgent suspension', async () => {
		const pending = deferred<number>();
		const root = mount(FreshUrgentSuspend, { promiseFor: () => pending.promise, value: 1 });
		try {
			await act(() => {});
			expect(root.find('#fallback').textContent).toBe('fallback');
			await act(() => pending.resolve(1));
			expect(root.find('#content').textContent).toBe('content-1');
			expect(root.findAll('#fallback')).toHaveLength(0);
		} finally {
			root.unmount();
		}
	});
});
