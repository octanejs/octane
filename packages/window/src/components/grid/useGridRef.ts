import { useRef } from 'octane';
import { getPublicArgument, getSlot, subSlot } from '../../internal.js';
import type { GridImperativeAPI } from './types.js';

/**
 * Convenience hook to return a properly typed ref for the Grid component.
 */
export const useGridRef = ((...args: unknown[]) => {
	const slot = getSlot(args);
	const initialValue = getPublicArgument(args, 0) as GridImperativeAPI | null | undefined;
	return useRef(initialValue, subSlot(slot, 'grid-ref'));
}) as typeof import('react').useRef<GridImperativeAPI>;
