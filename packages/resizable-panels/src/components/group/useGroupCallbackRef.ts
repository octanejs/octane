import { useState } from 'octane';
import type { GroupImperativeHandle } from './types';

export function useGroupCallbackRef(slot?: symbol) {
	return useState<GroupImperativeHandle | null>(null, slot);
}
