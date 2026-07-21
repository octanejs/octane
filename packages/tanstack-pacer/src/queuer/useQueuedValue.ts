import { useEffect, useState } from 'octane';
import { useQueuedState } from './useQueuedState';
import type { ReactQueuer, ReactQueuerOptions } from './useQueuer';
import type { QueuerState } from '@tanstack/pacer/queuer';

/**
 * An Octane hook that creates a queued value that processes changes through a
 * queue, updating at the queue's pace.
 *
 * @example
 * ```tsx
 * const [queuedValue, queuer] = useQueuedValue(value, { wait: 500 });
 * ```
 */
export function useQueuedValue<
	TValue,
	TSelected extends Pick<QueuerState<TValue>, 'items'> = Pick<QueuerState<TValue>, 'items'>,
>(
	initialValue: TValue,
	options: ReactQueuerOptions<TValue, TSelected> = {},
	selector?: (state: QueuerState<TValue>) => TSelected,
): [TValue, ReactQueuer<TValue, TSelected>] {
	const [value, setValue] = useState<TValue>(initialValue);
	const [, addItem, queuer] = useQueuedState(
		(item) => {
			setValue(item);
		},
		options,
		selector,
	);

	useEffect(() => {
		addItem(initialValue);
	}, [initialValue, addItem]);

	return [value, queuer];
}
