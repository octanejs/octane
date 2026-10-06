import { describe, expect, it } from 'vitest';
import { createScope, type SignalHandle, type SignalSnapshot } from 'octane/signals';
import { act, mount } from './_helpers.js';
import { EqualPending, EqualPendingChild } from './_fixtures/signals-waiter-equivalent.tsrx';

function read$(value$: SignalHandle<string>): PromiseLike<unknown> {
	try {
		value$.get();
	} catch (waiting) {
		return waiting as PromiseLike<unknown>;
	}
	throw new Error('Expected a pending value');
}

describe('equivalent pending views', () => {
	it('wakes the displaced waiter, retains the accepted waiter, and transfers dependency invalidation', async () => {
		const scope = createScope({ scopeKey: 'equivalent' });
		const ready$ = scope.signal$('ready', false);
		const waiting = new Promise<void>(() => {});
		const renders: PromiseLike<unknown>[] = [];
		const onRender = (value$: SignalHandle<string>, snapshot: SignalSnapshot<string>) => {
			if (snapshot.status === 'pending') renders.push(read$(value$));
		};
		const onEvent = () => {};
		const root = mount(EqualPending, { ready$, waiting, version: 0, onRender, onEvent });
		try {
			const before = renders[renders.length - 1]!;
			let oldWoke = false;
			before.then(() => {
				oldWoke = true;
			});
			await act(() =>
				root.update(EqualPending, { ready$, waiting, version: 1, onRender, onEvent }),
			);
			const accepted = renders[renders.length - 1]!;
			expect(accepted).not.toBe(before);
			expect(oldWoke).toBe(true);
			let newWoke = false;
			accepted.then(() => {
				newWoke = true;
			});
			expect(newWoke).toBe(false);
			await act(() => ready$.set(true));
			expect(newWoke).toBe(true);
			expect(root.find('p').textContent).toBe('ready:1');
		} finally {
			root.unmount();
			scope.dispose();
		}
	});
});

it('keeps an async reader settled on the new waiter after an equivalent redeclaration', async () => {
	const scope = createScope({ scopeKey: 'equivalent-reader' });
	const ready$ = scope.signal$('ready', false);
	const waiting = new Promise<void>(() => {});
	const root = mount(EqualPendingChild, { ready$, waiting, version: 0 });
	try {
		expect(root.find('span').textContent).toBe('pending');
		await act(() => root.update(EqualPendingChild, { ready$, waiting, version: 1 }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.find('span').textContent).toBe('pending');
		await act(() => ready$.set(true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.find('span').textContent).toBe('ready:1');
	} finally {
		root.unmount();
		scope.dispose();
	}
});
