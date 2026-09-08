import { useRef } from 'octane';
import type { GroupImperativeHandle } from './types';

export function useGroupRef(slot?: symbol) {
	return useRef<GroupImperativeHandle | null>(null, slot);
}
