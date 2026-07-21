import { useCallback } from 'octane';
import { useAsyncThrottler } from './useAsyncThrottler';
import type { ReactAsyncThrottlerOptions } from './useAsyncThrottler';
import type { AnyAsyncFunction } from '@tanstack/pacer/types';

/**
 * An Octane hook that creates a throttled version of an async callback
 * function.
 *
 * @example
 * ```tsx
 * const throttledSave = useAsyncThrottledCallback(saveApi, { wait: 1000 });
 * ```
 */
export function useAsyncThrottledCallback<TFn extends AnyAsyncFunction>(
	fn: TFn,
	options: ReactAsyncThrottlerOptions<TFn, {}>,
): (...args: Parameters<TFn>) => Promise<ReturnType<TFn>> {
	const asyncThrottledFn = useAsyncThrottler(fn, options).maybeExecute;
	return useCallback(
		(...args) => asyncThrottledFn(...args) as Promise<ReturnType<TFn>>,
		[asyncThrottledFn],
	);
}
