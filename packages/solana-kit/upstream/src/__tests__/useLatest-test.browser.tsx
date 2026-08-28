import { renderHook } from '../__test-utils__/render';
import { useLatest } from '../useLatest';

describe('useLatest', () => {
    it('exposes the most recently rendered value via the ref', () => {
        const { result, rerender } = renderHook(({ value }) => useLatest(value), {
            initialProps: { value: 'first' },
        });
        expect(result.current.current).toBe('first');

        rerender({ value: 'second' });
        expect(result.current.current).toBe('second');
    });

    it('returns a stable ref object across renders', () => {
        const { result, rerender } = renderHook(({ value }) => useLatest(value), {
            initialProps: { value: 1 },
        });
        const ref = result.current;

        rerender({ value: 2 });
        expect(result.current).toBe(ref);
    });
});
