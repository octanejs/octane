import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { PendingPair, type Start } from './_fixtures/transition-hook-pending.tsrx';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function mountPair() {
	let first!: Start;
	let second!: Start;
	const root = mount(PendingPair, {
		bind: (a, b) => {
			first = a;
			second = b;
		},
	});
	return {
		root,
		first: (fn: Parameters<Start>[0]) => first(fn),
		second: (fn: Parameters<Start>[0]) => second(fn),
	};
}

// React parity: a hook's isPending covers every Action it started and falls
// only when the last of them settles, however the Actions overlap or nest.
describe('useTransition pending ownership across overlapping Actions', () => {
	it('stays pending until the last of two overlapping Actions from one hook settles', async () => {
		const a = deferred();
		const b = deferred();
		const { root, first } = mountPair();
		try {
			await act(() => first(() => a.promise));
			await act(() => first(() => b.promise));
			expect(root.find('span').textContent).toBe('true:false');
			await act(async () => {
				a.resolve();
				await a.promise;
			});
			expect(root.find('span').textContent).toBe('true:false');
			await act(async () => {
				b.resolve();
				await b.promise;
			});
			expect(root.find('span').textContent).toBe('false:false');
		} finally {
			a.resolve();
			b.resolve();
			await act(() => {});
			root.unmount();
		}
	});

	it('shares one pending window between a hook and a second hook started inside its Action', async () => {
		const inner = deferred();
		const { root, first, second } = mountPair();
		try {
			await act(() => first(() => second(() => inner.promise)));
			expect(root.find('span').textContent).toBe('true:true');
			await act(async () => {
				inner.resolve();
				await inner.promise;
			});
			expect(root.find('span').textContent).toBe('false:false');
		} finally {
			inner.resolve();
			await act(() => {});
			root.unmount();
		}
	});

	it('counts a hook once however many nested starts it performs inside its own Action', async () => {
		const outer = deferred();
		const { root, first } = mountPair();
		try {
			await act(() =>
				first(async () => {
					first(() => {});
					first(() => {});
					await outer.promise;
				}),
			);
			expect(root.find('span').textContent).toBe('true:false');
			await act(async () => {
				outer.resolve();
				await outer.promise;
			});
			expect(root.find('span').textContent).toBe('false:false');
		} finally {
			outer.resolve();
			await act(() => {});
			root.unmount();
		}
	});

	it('settles an Action whose starting hook unmounted before it finished', async () => {
		const pending = deferred();
		const { root, first } = mountPair();
		let unmounted = false;
		try {
			await act(() => first(() => pending.promise));
			expect(root.find('span').textContent).toBe('true:false');
			root.unmount();
			unmounted = true;
			await act(async () => {
				pending.resolve();
				await pending.promise;
			});
			expect(root.container.innerHTML).toBe('');
		} finally {
			pending.resolve();
			await act(() => {});
			if (!unmounted) root.unmount();
		}
	});
});
