import { useState } from 'octane';
import type { PanelImperativeHandle } from './types';

export function usePanelCallbackRef(slot?: symbol) {
	return useState<PanelImperativeHandle | null>(null, slot);
}
