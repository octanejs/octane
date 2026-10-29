import { describe, it, expect, vi } from 'vitest';
import {
	createElement,
	createRoot,
	flushSync,
	useState,
	useReducer,
	useEffect,
	useLayoutEffect,
	useInsertionEffect,
	useMemo,
	useCallback,
	useRef,
	useId,
	useImperativeHandle,
	useEffectEvent,
	useTransition,
	useDeferredValue,
	useSyncExternalStore,
	withSlot,
} from '../src/index.js';

// The `slot: symbol` argument on every hook is COMPILER-INJECTED.
// octane/compiler appends a `Symbol.for(stableId)` to every hook call so
// each call site has a stable identity within its scope and across HMR.
// Public TypeScript signature is now `slot?: symbol` so authors writing
// `useState(0)` in their editor don't see a confusing "Expected 2 args"
// diagnostic. At runtime the hook throws if the slot is missing — almost
// always because the source was loaded outside the Vite plugin. The
// escape hatch is documented: `useState(0, Symbol.for('my-id'))`.

describe('slot ergonomics — public signature hides the compiler-injected slot', () => {
	it('useState without a slot throws a clear, actionable error', () => {
		expect(() => useState(0)).toThrow(/useState was called without a hook slot/);
		expect(() => useState(0)).toThrow(/octane\/compiler\/vite/);
		expect(() => useState(0)).toThrow(/Symbol\.for/);
	});

	it.each([
		['useReducer', () => useReducer((s: number, a: number) => s + a, 0)],
		['useEffect', () => useEffect(() => {}, [])],
		['useLayoutEffect', () => useLayoutEffect(() => {}, [])],
		['useInsertionEffect', () => useInsertionEffect(() => {}, [])],
		['useMemo', () => useMemo(() => 0, [])],
		['useCallback', () => useCallback(() => 0, [])],
		['useRef', () => useRef(0)],
		['useId', () => useId()],
		['useEffectEvent', () => useEffectEvent(() => 0)],
		['useTransition', () => useTransition()],
		['useImperativeHandle', () => useImperativeHandle({ current: null }, () => ({}), [])],
		['useDeferredValue', () => useDeferredValue(0)],
		[
			'useSyncExternalStore',
			() =>
				useSyncExternalStore(
					() => () => {},
					() => 0,
				),
		],
	])('%s without a slot throws naming the hook', (name, call) => {
		expect(call).toThrow(new RegExp(`${name} was called without a hook slot`));
	});

	it.each([
		['omitted', () => useCallback(() => 0)],
		['null', () => useCallback(() => 0, null)],
	])('useCallback with %s dependencies still names the missing hook', (_deps, call) => {
		expect(call).toThrow(/useCallback was called without a hook slot/);
	});

	it('restores missing-slot diagnostics after a manual hook throws', () => {
		const failure = new Error('manual hook failed');
		expect(() =>
			withSlot(Symbol('throwing-custom-hook'), () => {
				throw failure;
			}),
		).toThrow(failure);
		expect(() => useCallback(() => 0, [])).toThrow(/useCallback was called without a hook slot/);
	});
});

// Compiled code always supplies the slot, so a slotted hook that finds no
// rendering component was called outside a render, or by a second copy of the
// runtime that is not the one rendering (octanejs/octane#2287).
describe('missing hook owner — a slotted hook with no rendering component', () => {
	it('explains a hook called outside a component render', () => {
		expect(() => useState(0, Symbol('outside-render'))).toThrow(
			/A hook was called outside a component render/,
		);
	});

	it('explains a custom hook whose path supplies the slot outside a component render', () => {
		expect(() => withSlot(Symbol('custom-hook'), () => useState(0))).toThrow(
			/A hook was called outside a component render/,
		);
	});

	it('points at a second copy of Octane when that copy runs the hook during a render', async () => {
		vi.resetModules();
		const other = (await import('../src/index.js')) as typeof import('../src/index.js');
		expect(other.useState).not.toBe(useState);
		const slot = Symbol('second-runtime');
		function Widget() {
			const [value] = other.useState('ready', slot);
			return createElement('span', null, value);
		}
		const errors: unknown[] = [];
		const container = document.createElement('div');
		const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
		try {
			flushSync(() => root.render(Widget, {}));
			expect(container.textContent).toBe('');
			expect(errors).toHaveLength(1);
			const message = (errors[0] as Error).message;
			expect(message).toMatch(/A hook was called outside a component render/);
			expect(message).toMatch(/more than one copy of Octane/);
			expect(message).toMatch(/octane\/internal\/client/);
		} finally {
			root.unmount();
		}
	});
});
