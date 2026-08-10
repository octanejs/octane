// `useReducedMotion()` — subscribe to the user's operating-system preference.
//
// Motion's React hook reads the shared `prefers-reduced-motion` query. This
// binding keeps the query shared too, but also publishes later `change` events
// so mounted Octane consumers update when the setting changes.
import { useSyncExternalStore } from 'octane';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type MatchMedia = typeof window.matchMedia;

let activeMatchMedia: MatchMedia | null = null;
let activeQuery: MediaQueryList | null = null;
let detachActiveQuery: (() => void) | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
	for (const listener of listeners) listener();
}

function attachQuery(query: MediaQueryList): () => void {
	const onChange = () => notifyListeners();

	if (typeof query.addEventListener === 'function') {
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}

	// Safari < 14 exposes the deprecated MediaQueryList listener API only.
	query.addListener(onChange);
	return () => query.removeListener(onChange);
}

function getQuery(): MediaQueryList | null {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return null;
	}

	const matchMedia = window.matchMedia;
	if (activeQuery === null || activeMatchMedia !== matchMedia) {
		detachActiveQuery?.();
		detachActiveQuery = null;
		activeMatchMedia = matchMedia;
		activeQuery = matchMedia.call(window, REDUCED_MOTION_QUERY);
		if (listeners.size > 0) detachActiveQuery = attachQuery(activeQuery);
	}

	return activeQuery;
}

function getSnapshot(): boolean {
	return getQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
	return false;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	const query = getQuery();
	if (query !== null && detachActiveQuery === null) {
		detachActiveQuery = attachQuery(query);
	}

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			detachActiveQuery?.();
			detachActiveQuery = null;
		}
	};
}

export function useReducedMotionAtSlot(slot: symbol): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot, slot);
}

export function useReducedMotion(): boolean;
export function useReducedMotion(...args: any[]): boolean {
	// Calls from compiled `.tsrx` append the call-site slot. Accept no public
	// arguments, but deliberately strip that compiler-owned trailing Symbol.
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot, slot);
}
