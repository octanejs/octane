import { createStore } from '@octanejs/zustand/vanilla';
import { Direction } from '../../../../types';

export const collisionStore = createStore<{
	fallbackEnabled: boolean;
}>(() => ({
	fallbackEnabled: false,
}));
