import { useRef } from 'octane';
import type { PanelImperativeHandle } from './types';

export function usePanelRef(slot?: symbol) {
	return useRef<PanelImperativeHandle | null>(null, slot);
}
