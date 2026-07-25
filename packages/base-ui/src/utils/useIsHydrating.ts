// Ported from Base UI's useIsHydrating: the server snapshot must also be used
// for the first hydration render so layout-dependent slider styles are adopted
// before the client snapshot makes the hydrated controls visible.
import { useSyncExternalStore } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

function subscribe(): () => void {
	return () => {};
}

function getSnapshot(): boolean {
	return false;
}

function getServerSnapshot(): boolean {
	return true;
}

export function useIsHydrating(): boolean;
export function useIsHydrating(slot: symbol | undefined): boolean;
export function useIsHydrating(...args: unknown[]): boolean {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useIsHydrating');
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot, subSlot(slot, 'store'));
}
