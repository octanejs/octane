import { describe, expect, it } from 'vitest';
import { startTransition } from '../src/index.js';
import { act, mount } from './_helpers.js';
import {
	GenericChildTransition,
	GenericChildStateTransition,
	type GenericChildSnapshot,
	type GenericChildStore,
} from './_fixtures/generic-child-transitions.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function makeStore(initial: GenericChildSnapshot): GenericChildStore & {
	set: (snapshot: GenericChildSnapshot) => void;
} {
	let snapshot = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => snapshot,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		set(next) {
			snapshot = next;
			for (const listener of listeners) listener();
		},
	};
}

describe.each(['state', 'store'] as const)('renderable children updated through %s', (mode) => {
	it.each([
		{ kind: 'string', value: 'next', expected: 'next' },
		{ kind: 'number', value: 0, expected: '0' },
		{ kind: 'boolean', value: true, expected: '' },
	])('reveals the latest $kind child after a suspended attempt', async ({ value, expected }) => {
		const first = deferred<string>();
		const second = deferred<string>();
		first.resolve('ready:first');
		const store = makeStore({ value: 'first', request: first.promise });
		let setSnapshot!: (snapshot: GenericChildSnapshot) => void;
		const root =
			mode === 'store'
				? mount(GenericChildTransition, { store })
				: mount(GenericChildStateTransition, {
						initial: store.get(),
						bind: (set) => {
							setSnapshot = set;
						},
					});
		try {
			await act(() => {});
			const onlyChild = root.find('#only-child');
			const descriptorChild = root.find('#descriptor-child');
			const anchoredChild = root.find('#anchored-child');
			const input = root.find('#retained-input') as HTMLInputElement;
			input.value = 'typed by the user';
			expect(onlyChild.textContent).toBe('first');
			expect(descriptorChild.textContent).toBe('first');
			expect(anchoredChild.textContent).toBe('before:first:after');

			await act(() => {
				if (mode === 'store') startTransition(() => store.set({ value, request: second.promise }));
				else setSnapshot({ value, request: second.promise });
			});
			if (mode === 'state') {
				expect(onlyChild.textContent).toBe('first');
				expect(descriptorChild.textContent).toBe('first');
				expect(anchoredChild.textContent).toBe('before:first:after');
				expect(root.find('#ready').textContent).toBe('ready:first');
				expect(root.find('#pending').textContent).toBe('pending');
				expect(root.findAll('#fallback')).toEqual([]);
			} else {
				// External stores stay synchronous, including notifications inside
				// startTransition. The incomplete primary is hidden behind fallback.
				expect(root.find('#fallback').textContent).toBe('loading');
				expect(root.find('#pending').textContent).toBe('idle');
				expect(onlyChild.parentElement!.style.display).toBe('none');
			}

			await act(() => second.resolve('ready:second'));
			expect(root.find('#only-child')).toBe(onlyChild);
			expect(root.find('#descriptor-child')).toBe(descriptorChild);
			expect(root.find('#anchored-child')).toBe(anchoredChild);
			expect(onlyChild.textContent).toBe(expected);
			expect(descriptorChild.textContent).toBe(expected);
			expect(anchoredChild.textContent).toBe(`before:${expected}:after`);
			expect(root.find('#ready').textContent).toBe('ready:second');
			expect(root.find('#pending').textContent).toBe('idle');
			expect(root.find('#retained-input')).toBe(input);
			expect(input.value).toBe('typed by the user');
			expect(root.findAll('#fallback')).toEqual([]);
		} finally {
			root.unmount();
		}
	});
});
