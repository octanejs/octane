/**
 * `renderHook()` conformance — ports of react-testing-library@be9d81d
 * src/__tests__/renderHook.js, re-authored for octane. The hook callbacks are
 * plain-`.ts` and import base hooks from 'octane', so the compiler's surgical
 * slotting pass assigns their call-site slots (exactly what an octane user's
 * vitest setup does).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { useState, useEffect, useContext, useCallback } from 'octane';
import { renderHook, cleanup, act } from '@octanejs/testing-library';
import { LocaleCtx, FrenchProvider } from './_fixtures/context.tsrx';

afterEach(cleanup);

describe('renderHook', () => {
	// Per react-testing-library src/__tests__/renderHook.js:10 ("gives committed result")
	it('gives the committed result', () => {
		const { result } = renderHook(() => {
			const [state, setState] = useState(1);
			useEffect(() => {
				setState(2);
			}, []);
			return state;
		});
		// The effect's setState re-rendered and re-committed before returning.
		expect(result.current).toBe(2);
	});

	// Per renderHook.js:24 ("allows rerendering")
	it('allows rerendering with new props', () => {
		const { result, rerender } = renderHook(
			(props: { branch: 'left' | 'right' }) => {
				const [left, setLeft] = useState('left');
				const [right, setRight] = useState('right');
				switch (props.branch) {
					case 'left':
						return [left, setLeft] as const;
					case 'right':
						return [right, setRight] as const;
				}
			},
			{ initialProps: { branch: 'left' } },
		);
		expect(result.current![0]).toBe('left');
		rerender({ branch: 'right' });
		expect(result.current![0]).toBe('right');
	});

	// Per renderHook.js:53 ("allows wrapper components")
	it('allows wrapper components (context provider)', () => {
		const { result } = renderHook(() => useContext(LocaleCtx), {
			wrapper: FrenchProvider,
		});
		expect(result.current).toBe('fr');
	});

	it('reads the context default without a wrapper', () => {
		const { result } = renderHook(() => useContext(LocaleCtx));
		expect(result.current).toBe('en');
	});

	it('updates result.current when an act()-wrapped update commits', async () => {
		const { result } = renderHook(() => {
			const [count, setCount] = useState(0);
			const increment = useCallback(() => setCount((c) => c + 1), []);
			return { count, increment };
		});
		expect(result.current.count).toBe(0);
		await act(() => {
			result.current.increment();
		});
		expect(result.current.count).toBe(1);
	});

	it('unmount runs the hook effects cleanup', () => {
		const log: string[] = [];
		const { unmount } = renderHook(() => {
			useEffect(() => {
				log.push('mount');
				return () => log.push('cleanup');
			}, []);
		});
		expect(log).toEqual(['mount']);
		unmount();
		expect(log).toEqual(['mount', 'cleanup']);
	});

	it('two renderHook harnesses keep independent hook state', async () => {
		const useCounter = () => {
			const [count, setCount] = useState(0);
			return { count, inc: () => setCount((c) => c + 1) };
		};
		const a = renderHook(useCounter);
		const b = renderHook(useCounter);
		await act(() => {
			a.result.current.inc();
		});
		expect(a.result.current.count).toBe(1);
		expect(b.result.current.count).toBe(0);
	});
});
