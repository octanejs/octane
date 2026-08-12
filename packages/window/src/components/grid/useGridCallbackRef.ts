import { useState } from 'octane';
import { getPublicArgument, getSlot, subSlot } from '../../internal.js';
import type { GridImperativeAPI } from './types.js';

/**
 * Convenience hook to return a properly typed ref callback for the Grid component.
 *
 * Use this hook when you need to share the ref with another component or hook.
 */
export const useGridCallbackRef = ((...args: unknown[]) => {
	const slot = getSlot(args);
	const initialValue = getPublicArgument(args, 0) as
		GridImperativeAPI | null | (() => GridImperativeAPI | null) | undefined;
	const [value, setValue] = useState(initialValue, subSlot(slot, 'grid-callback-ref'));
	return [value, setValue];
}) as unknown as typeof import('react').useState<GridImperativeAPI | null>;
