import { useRef } from 'octane';
import { getPublicArgument, getSlot, subSlot } from '../../internal';
import type { ListImperativeAPI } from './types';

/**
 * Convenience hook to return a properly typed ref for the List component.
 */
export const useListRef = ((...args: unknown[]) => {
	const slot = getSlot(args);
	const initialValue = getPublicArgument(args, 0) as ListImperativeAPI | null | undefined;
	return useRef(initialValue, subSlot(slot, 'list-ref'));
}) as typeof import('react').useRef<ListImperativeAPI>;
