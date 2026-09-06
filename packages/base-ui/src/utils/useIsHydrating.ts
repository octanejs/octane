/** @jsxImportSource octane */
import { useSyncExternalStore } from 'octane';
import { NOOP } from '../internals/noop';

function subscribe() {
	return NOOP;
}

function getSnapshot() {
	return false;
}

function getServerSnapshot() {
	return true;
}

/**
 * Returns `true` while React is hydrating server-rendered markup and `false`
 * for fresh client-only mounts.
 */
export function useIsHydrating() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
