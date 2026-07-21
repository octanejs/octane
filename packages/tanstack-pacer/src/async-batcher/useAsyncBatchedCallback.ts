import { useCallback } from 'octane';
import { useAsyncBatcher } from './useAsyncBatcher';
import type { ReactAsyncBatcherOptions } from './useAsyncBatcher';

/**
 * An Octane hook that creates a batched version of an async callback
 * function. Calling the returned function adds the item to the batch.
 *
 * @example
 * ```tsx
 * const addToBatch = useAsyncBatchedCallback(processBatch, { maxSize: 10 });
 * ```
 */
export function useAsyncBatchedCallback<TValue>(
	fn: (items: Array<TValue>) => Promise<unknown>,
	options: ReactAsyncBatcherOptions<TValue, {}>,
): (item: TValue) => Promise<void> {
	const asyncBatchedFn = useAsyncBatcher(fn, options).addItem;
	return useCallback((item: TValue) => asyncBatchedFn(item), [asyncBatchedFn]);
}
