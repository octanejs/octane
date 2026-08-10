import { useState } from 'octane';
import { getPublicArgument, getSlot, subSlot } from '../../internal';
import type { ListImperativeAPI } from './types';

/**
 * Convenience hook to return a properly typed ref callback for the List component.
 *
 * Use this hook when you need to share the ref with another component or hook.
 */
export const useListCallbackRef = ((...args: unknown[]) => {
	const slot = getSlot(args);
	const initialValue = getPublicArgument(args, 0) as
		ListImperativeAPI | null | (() => ListImperativeAPI | null) | undefined;
	const [value, setValue] = useState(initialValue, subSlot(slot, 'list-callback-ref'));
	return [value, setValue];
}) as unknown as typeof import('react').useState<ListImperativeAPI | null>;
