import { useMemo } from 'octane';
import { getSlot, subSlot } from '../internal.js';
import { createCachedBounds } from './createCachedBounds.js';
import type { CachedBounds, SizeFunction } from './types.js';

export function useCachedBounds<Props extends object>(
	{
		itemCount,
		itemProps,
		itemSize,
	}: {
		itemCount: number;
		itemProps: Props;
		itemSize: number | SizeFunction<Props>;
	},
	...rest: unknown[]
): CachedBounds {
	const slot = getSlot(rest);
	return useMemo(
		() =>
			createCachedBounds({
				itemCount,
				itemProps,
				itemSize,
			}),
		[itemCount, itemProps, itemSize],
		subSlot(slot, 'bounds'),
	);
}
