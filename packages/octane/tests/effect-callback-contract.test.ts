import { describe, expect, it, vi } from 'vitest';
import {
	createElement,
	createRoot,
	drainPassiveEffects,
	flushSync,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
} from '../src/index.js';

const phases = [
	['insertion', useInsertionEffect],
	['layout', useLayoutEffect],
	['passive', useEffect],
] as const;

describe.each(phases)('%s effect callback contract', (_phase, usePhaseEffect) => {
	it.each([
		['omitted', undefined],
		['null', null],
		['empty', []],
		['one', [1]],
		['two', [1, undefined]],
		['three', [1, undefined, 'third']],
		['four', [1, undefined, 'third', null]],
	] as const)('preserves the null receiver and %s positional dependencies', (_name, deps) => {
		const calls: { receiver: unknown; args: unknown[] }[] = [];
		const cleanup = vi.fn();
		const slot = Symbol('effect callback arguments');
		function effect(this: unknown, ...args: unknown[]) {
			calls.push({ receiver: this, args });
			return cleanup;
		}
		function App() {
			usePhaseEffect(effect, deps as unknown[] | null | undefined, slot);
			return createElement('div', { children: 'mounted' });
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		try {
			flushSync(() => root.render(App));
			drainPassiveEffects();
			expect(container.textContent).toBe('mounted');
			expect(calls).toEqual([{ receiver: null, args: deps ?? [] }]);
			expect(cleanup).not.toHaveBeenCalled();
			root.unmount();
			drainPassiveEffects();
			expect(cleanup).toHaveBeenCalledTimes(1);
		} finally {
			root.unmount();
			drainPassiveEffects();
		}
	});

	it('reads the callback apply property before positional dependency getters', () => {
		const events: string[] = [];
		const token = {};
		const deps: unknown[] = [token, undefined, undefined];
		delete deps[1];
		Object.defineProperty(deps, 2, {
			get() {
				events.push('dependency');
				return 'third';
			},
		});
		const calls: { receiver: unknown; args: unknown[] }[] = [];
		function effect(this: unknown, ...args: unknown[]) {
			events.push('body');
			calls.push({ receiver: this, args });
			return () => {
				events.push('cleanup');
			};
		}
		Object.defineProperty(effect, 'apply', {
			get() {
				events.push('apply');
				return function (this: unknown, receiver: unknown, args: unknown[]) {
					expect(this).toBe(effect);
					expect(receiver).toBe(null);
					expect(args).toBe(deps);
					return Reflect.apply(effect, receiver, args);
				};
			},
		});
		const slot = Symbol('observable effect apply');
		function App() {
			usePhaseEffect(effect, deps, slot);
			return createElement('span', { children: 'mounted' });
		}
		const root = createRoot(document.createElement('div'));
		try {
			flushSync(() => root.render(App));
			drainPassiveEffects();
			expect(events).toEqual(['apply', 'dependency', 'body']);
			expect(calls).toEqual([{ receiver: null, args: [token, undefined, 'third'] }]);
			expect(calls[0].args[0]).toBe(token);
			root.unmount();
			drainPassiveEffects();
			expect(events).toEqual(['apply', 'dependency', 'body', 'cleanup']);
		} finally {
			root.unmount();
			drainPassiveEffects();
		}
	});

	it('routes an exception from the callback apply getter to the root', () => {
		const failure = new Error('effect apply getter');
		const onUncaughtError = vi.fn();
		const body = vi.fn();
		Object.defineProperty(body, 'apply', {
			get() {
				throw failure;
			},
		});
		const slot = Symbol('throwing effect apply');
		function App() {
			usePhaseEffect(body, [], slot);
			return createElement('span', { children: 'mounted' });
		}
		const container = document.createElement('div');
		const root = createRoot(container, { onUncaughtError });
		try {
			flushSync(() => root.render(App));
			drainPassiveEffects();
			expect(body).not.toHaveBeenCalled();
			expect(onUncaughtError).toHaveBeenCalledTimes(1);
			expect(onUncaughtError.mock.calls[0][0]).toBe(failure);
			expect(container.textContent).toBe('');
		} finally {
			root.unmount();
			drainPassiveEffects();
		}
	});
});
