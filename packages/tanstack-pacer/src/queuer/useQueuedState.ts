import { useQueuer } from './useQueuer';
import type { ReactQueuer, ReactQueuerOptions } from './useQueuer';
import type { Queuer, QueuerState } from '@tanstack/pacer/queuer';

/**
 * An Octane hook that creates a queue with managed state. Returns a tuple of
 * the current queue items, an addItem function, and the queuer instance.
 *
 * The selector defaults to tracking `items` (this hook is inherently
 * reactive to the queue contents).
 *
 * @example
 * ```tsx
 * const [items, addItem, queuer] = useQueuedState(processItem, { wait: 1000 });
 * ```
 */
export function useQueuedState<
	TValue,
	TSelected extends Pick<QueuerState<TValue>, 'items'> = Pick<QueuerState<TValue>, 'items'>,
>(
	fn: (item: TValue) => void,
	options: ReactQueuerOptions<TValue, TSelected> = {},
	selector?: (state: QueuerState<TValue>) => TSelected,
): [Array<TValue>, Queuer<TValue>['addItem'], ReactQueuer<TValue, TSelected>] {
	const queue = useQueuer(fn, options, selector);
	return [queue.state.items, queue.addItem, queue];
}
