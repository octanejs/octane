import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	startTransition,
	universalPlan,
	universalValue,
	useState,
} from '../src/universal-native.js';

const valuePlan = universalPlan('object', {
	kind: 'host',
	type: 'state-value',
	bindings: [['value', 0]],
});

function stateRoot<T>(initial: T, display: (value: T) => unknown = (value) => value) {
	let set!: (value: T | ((previous: T) => T)) => void;
	let get!: () => T;
	const Scene = defineUniversalComponent('object', (props: { duringRender?: () => void }) => {
		const [value, update, read] = useState(() => initial, 'state');
		set = update;
		get = read;
		props.duringRender?.();
		return universalValue(valuePlan, [display(value)]);
	});
	const scheduled: Array<() => void> = [];
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver(), {
		scheduleMicrotask: (callback) => scheduled.push(callback),
	});
	root.render(Scene, {});
	return {
		container,
		root,
		Scene,
		set: (value: T | ((previous: T) => T)) => set(value),
		get: () => get(),
		flush() {
			for (let count = 0; scheduled.length !== 0; count++) {
				if (count === 50) throw new Error('Universal state updates did not settle.');
				scheduled.shift()!();
			}
		},
	};
}

describe('universal queued state values', () => {
	it('preserves the order of replacement values and functional updates', () => {
		const state = stateRoot(1);
		flushUniversalSync(() => {
			state.set((value) => value + 2);
			expect(state.get()).toBe(3);
			state.set(10);
			expect(state.get()).toBe(10);
			state.set((value) => value * 3);
			expect(state.get()).toBe(30);
			state.set((value) => value + 4);
			expect(state.get()).toBe(34);
		});
		expect(state.container.children[0].props.value).toBe(34);
		flushUniversalSync(() => {
			state.set((value) => value + 100);
			state.set(0);
			expect(state.get()).toBe(0);
		});
		expect(state.container.children[0].props.value).toBe(0);
		state.root.unmount();
	});

	it('retains falsy replacements and function-valued state', () => {
		const values = stateRoot<undefined | null | false | number>(1);
		flushUniversalSync(() => {
			values.set(undefined);
			expect(values.get()).toBeUndefined();
			values.set(null);
			expect(values.get()).toBeNull();
			values.set(false);
			expect(values.get()).toBe(false);
			values.set(0);
			expect(values.get()).toBe(0);
		});
		expect(values.container.children[0].props.value).toBe(0);
		values.root.unmount();

		const functions = stateRoot(
			() => 1,
			(value) => value(),
		);
		flushUniversalSync(() => {
			functions.set(() => () => 7);
			expect(functions.get()()).toBe(7);
		});
		expect(functions.container.children[0].props.value).toBe(7);
		functions.root.unmount();
	});

	it('uses urgent values for urgent updaters while projecting and rebasing transition values', () => {
		const state = stateRoot(0);
		flushUniversalSync(() => {
			state.set(5);
			startTransition(() => {
				state.set(100);
				expect(state.get()).toBe(100);
			});
			let urgentInput = -1;
			state.set((value) => {
				urgentInput = value;
				return value + 1;
			});
			// The eager urgent calculation must not observe the parked transition.
			expect(urgentInput).toBe(5);
			expect(state.get()).toBe(101);
		});
		expect(state.container.children[0].props.value).toBe(6);
		state.flush();
		expect(state.container.children[0].props.value).toBe(101);
		state.root.unmount();
	});

	it('keeps an urgent replacement when an older transition is later replayed', () => {
		const state = stateRoot(0);
		flushUniversalSync(() => {
			startTransition(() => state.set(100));
			state.set(0);
			expect(state.get()).toBe(0);
		});
		expect(state.container.children[0].props.value).toBe(0);
		state.flush();
		expect(state.container.children[0].props.value).toBe(0);
		state.root.unmount();
	});

	it('reads the active draft before pending replacements and discards an aborted draft', () => {
		const state = stateRoot(0);
		state.set(10);
		let updated = false;
		let observed = -1;
		const prepared = state.root.prepare(state.Scene, {
			duringRender() {
				if (!updated) {
					updated = true;
					state.set((value) => value + 1);
				}
				observed = state.get();
			},
		});
		expect(prepared.status).toBe('prepared');
		expect(observed).toBe(11);
		expect(state.container.children[0].props.value).toBe(0);
		prepared.abort();
		expect(state.get()).toBe(10);
		state.root.render(state.Scene, {});
		expect(state.container.children[0].props.value).toBe(10);
		state.root.unmount();
	});
});
