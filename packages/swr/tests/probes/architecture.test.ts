import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { readDevtoolsMiddleware, setupOctaneDevtools } from '../../src/_internal/devtools-contract';
import {
	ExternalStoreProbe,
	MutationTransitionProbe,
	transitionMutationState,
} from './external-store.tsrx';

type Store = ReturnType<typeof createStore>;

function createStore(initial: string) {
	let value = initial;
	let subscribeCalls = 0;
	let unsubscribeCalls = 0;
	const listeners = new Set<() => void>();
	return {
		get subscribeCalls() {
			return subscribeCalls;
		},
		get unsubscribeCalls() {
			return unsubscribeCalls;
		},
		subscribe: (callback: () => void) => {
			subscribeCalls++;
			listeners.add(callback);
			return () => {
				unsubscribeCalls++;
				listeners.delete(callback);
			};
		},
		getSnapshot: () => value,
		getServerSnapshot: () => value,
		set(next: string) {
			value = next;
			listeners.forEach((listener) => listener());
		},
	};
}

let container: HTMLElement;
afterEach(() => container?.remove());

function mount(Component: unknown, props?: object) {
	container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(Component as never, props);
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
	return root;
}

describe('SWR U1 architecture gates', () => {
	it('subscribes once, updates snapshots, swaps stores, and cleans up exactly once', () => {
		const first: Store = createStore('first');
		const second: Store = createStore('second');
		const root = mount(ExternalStoreProbe, { store: first });
		expect(container.textContent).toBe('first');
		expect(first.subscribeCalls).toBe(1);

		flushSync(() => first.set('updated'));
		expect(container.textContent).toBe('updated');

		root.render(ExternalStoreProbe, { store: second });
		flushSync(() => {});
		drainPassiveEffects();
		flushSync(() => {});
		expect(container.textContent).toBe('second');
		expect(first.unsubscribeCalls).toBe(1);
		expect(second.subscribeCalls).toBe(1);

		root.unmount();
		drainPassiveEffects();
		expect(second.unsubscribeCalls).toBe(1);
	});

	it('commits mutation-like state updates through startTransition', () => {
		const root = mount(MutationTransitionProbe);
		expect(container.textContent).toBe('idle');
		flushSync(() => transitionMutationState('mutating'));
		expect(container.textContent).toBe('mutating');
		root.unmount();
	});

	it('accepts only data-valued middleware arrays and never evaluates hostile getters', () => {
		const middleware = [() => undefined];
		expect(readDevtoolsMiddleware({ __SWR_DEVTOOLS_USE__: middleware })).toEqual(middleware);
		expect(readDevtoolsMiddleware({ __SWR_DEVTOOLS_USE__: 'hostile' })).toEqual([]);
		const getter = vi.fn(() => middleware);
		const hostile = Object.defineProperty({}, '__SWR_DEVTOOLS_USE__', { get: getter });
		expect(readDevtoolsMiddleware(hostile)).toEqual([]);
		expect(getter).not.toHaveBeenCalled();

		const target: Record<string, unknown> = {};
		const runtime = { name: 'octane' };
		setupOctaneDevtools(target, runtime);
		expect(target.__SWR_DEVTOOLS_OCTANE__).toBe(runtime);
		expect(target.__SWR_DEVTOOLS_REACT__).toBeUndefined();
	});
});
