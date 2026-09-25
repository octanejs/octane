// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
import { useSyncExternalStore } from 'octane';

import { splitSlot, subSlot } from '../internal';

export type ColorSchemePreference = 'dark' | 'light' | 'no-preference';

const darkQuery = '(prefers-color-scheme: dark)';
const lightQuery = '(prefers-color-scheme: light)';

function readPreference(): ColorSchemePreference {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return 'no-preference';
	}

	if (window.matchMedia(darkQuery).matches) {
		return 'dark';
	}

	return window.matchMedia(lightQuery).matches ? 'light' : 'no-preference';
}

function subscribe(onChange: () => void): () => void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return () => {};
	}

	const queries = [window.matchMedia(darkQuery), window.matchMedia(lightQuery)];
	for (const query of queries) {
		query.addEventListener('change', onChange);
	}
	return () => {
		for (const query of queries) {
			query.removeEventListener('change', onChange);
		}
	};
}

// The server cannot see the media query. Hydration renders this snapshot too,
// so server HTML and the first client render agree; the store then re-reads
// the live preference after hydration.
const serverPreference = (): ColorSchemePreference => 'no-preference';

/** Track the system `prefers-color-scheme` media query. */
export function usePrefersColorScheme(): ColorSchemePreference;
export function usePrefersColorScheme(...args: unknown[]): ColorSchemePreference {
	const [, slot] = splitSlot(args);
	return useSyncExternalStore(
		subscribe,
		readPreference,
		serverPreference,
		subSlot(slot, 'preference'),
	);
}
