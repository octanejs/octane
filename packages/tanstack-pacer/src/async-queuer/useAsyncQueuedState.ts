import { useAsyncQueuer } from './useAsyncQueuer';
import type { ReactAsyncQueuer, ReactAsyncQueuerOptions } from './useAsyncQueuer';
import type { AsyncQueuerState } from '@tanstack/pacer/async-queuer';

/**
 * An Octane hook that creates an async queue with managed state. Returns a
 * tuple of the current queue items and the queuer instance.
 *
 * The selector defaults to tracking `items` (this hook is inherently
 * reactive to the queue contents).
 *
 * @example
 * ```tsx
 * const [items, queuer] = useAsyncQueuedState(processItem, { concurrency: 2 });
 * ```
 */
export function useAsyncQueuedState<
	TValue,
	TSelected extends Pick<AsyncQueuerState<TValue>, 'items'> = Pick<
		AsyncQueuerState<TValue>,
		'items'
	>,
>(
	fn: (value: TValue) => Promise<any>,
	options: ReactAsyncQueuerOptions<TValue, TSelected> = {},
	selector?: (state: AsyncQueuerState<TValue>) => TSelected,
): [Array<TValue>, ReactAsyncQueuer<TValue, TSelected>] {
	const asyncQueuer = useAsyncQueuer(fn, options, selector);
	return [asyncQueuer.state.items, asyncQueuer];
}
