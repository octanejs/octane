import { describe, expect, it } from 'vitest';
import { startTransition } from '../src/index.js';
import { act, mount } from './_helpers.js';
import {
	GenericChildTransition,
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

describe('renderable children in a held transition', () => {
	it.each([
		{ kind: 'string', value: 'next', expected: 'next' },
		{ kind: 'number', value: 0, expected: '0' },
		{ kind: 'boolean', value: true, expected: '' },
	])('reveals the latest $kind child after a suspended attempt', async ({ value, expected }) => {
		const first = deferred<string>();
		const second = deferred<string>();
		first.resolve('ready:first');
		const store = makeStore({ value: 'first', request: first.promise });
		const root = mount(GenericChildTransition, { store });
		try {
			await act(() => {});
			const onlyChild = root.find('#only-child');
			const anchoredChild = root.find('#anchored-child');
			const input = root.find('#retained-input') as HTMLInputElement;
			input.value = 'typed by the user';
			expect(onlyChild.textContent).toBe('first');
			expect(anchoredChild.textContent).toBe('before:first:after');

			// The store keeps its new snapshot while the later sibling suspends.
			// Revealing must therefore reapply each child, not mistake its aborted
			// update for content that already reached the screen.
			await act(() => startTransition(() => store.set({ value, request: second.promise })));
			expect(onlyChild.textContent).toBe('first');
			expect(anchoredChild.textContent).toBe('before:first:after');
			expect(root.find('#ready').textContent).toBe('ready:first');
			expect(root.find('#pending').textContent).toBe('pending');
			expect(root.findAll('#fallback')).toEqual([]);

			await act(() => second.resolve('ready:second'));
			expect(root.find('#only-child')).toBe(onlyChild);
			expect(root.find('#anchored-child')).toBe(anchoredChild);
			expect(onlyChild.textContent).toBe(expected);
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
