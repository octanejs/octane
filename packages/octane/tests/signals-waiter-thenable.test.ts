import { expect, it } from 'vitest';
import { createScope, type SignalHandle, type SignalSnapshot } from 'octane/signals';
import { act, mount } from './_helpers.js';
import { EqualPending } from './_fixtures/signals-waiter-equivalent.tsrx';

function capture$(value$: SignalHandle<string>): PromiseLike<unknown> {
	try {
		value$.get();
	} catch (waiting) {
		return waiting as PromiseLike<unknown>;
	}
	throw new Error('Expected a pending value');
}

it('keeps the accepted waiter when a thenable yields a different source each time', async () => {
	const scope = createScope({ scopeKey: 'thenable' });
	const ready$ = scope.signal$('ready', false);
	let resolveFirst!: () => void;
	let resolveSecond!: () => void;
	const first = new Promise<void>((resolve) => {
		resolveFirst = resolve;
	});
	const second = new Promise<void>((resolve) => {
		resolveSecond = resolve;
	});
	let calls = 0;
	const thenable = {
		then(resolve: (value: void) => unknown, reject: (error: unknown) => unknown) {
			return (++calls === 1 ? first : second).then(resolve, reject);
		},
	} as unknown as Promise<void>;
	const captures: PromiseLike<unknown>[] = [];
	const onRender = (value$: SignalHandle<string>, snapshot: SignalSnapshot<string>) => {
		if (snapshot.status === 'pending') captures.push(capture$(value$));
	};
	const onEvent = () => {};
	const root = mount(EqualPending, { ready$, waiting: thenable, version: 0, onRender, onEvent });
	try {
		await act(() => {});
		expect(calls).toBe(1);
		await act(() =>
			root.update(EqualPending, { ready$, waiting: thenable, version: 1, onRender, onEvent }),
		);
		expect(calls).toBe(2);
		const accepted = captures[captures.length - 1]!;
		let acceptedWoke = false;
		accepted.then(() => {
			acceptedWoke = true;
		});
		await act(() => resolveFirst());
		expect(acceptedWoke).toBe(false);
		expect(root.find('p').textContent).toBe('pending');
		await act(() => {
			ready$.set(true);
			resolveSecond();
		});
		expect(acceptedWoke).toBe(true);
		expect(root.find('p').textContent).toBe('ready:1');
	} finally {
		root.unmount();
		scope.dispose();
	}
});
