import { useCallback } from 'octane';
import { useBatcher } from './useBatcher';
import type { ReactBatcherOptions } from './useBatcher';

/**
 * An Octane hook that creates a batched version of a callback function.
 * Calling the returned function adds the item to the batch.
 *
 * @example
 * ```tsx
 * const addToBatch = useBatchedCallback(processBatch, { maxSize: 10 });
 * ```
 */
export function useBatchedCallback<TValue>(
	fn: (items: Array<TValue>) => void,
	options: ReactBatcherOptions<TValue, {}>,
): (item: TValue) => void {
	const batchedFn = useBatcher(fn, options).addItem;
	return useCallback((item: TValue) => batchedFn(item), [batchedFn]);
}
