// Ported from .base-ui/packages/react/src/unstable-use-media-query/index.ts (v1.6.0).
// Subscribes to a CSS media query via `window.matchMedia`, with SSR escape hatches.
//
// octane adaptation: octane ships `useSyncExternalStore` natively, so Base UI's
// `use-sync-external-store/shim` import is dropped; the dev-only `useDebugValue` call is
// dropped with the rest of the dev-warning surface.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useMemo, useSyncExternalStore } from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { addEventListener } from './utils/addEventListener';

export interface UseMediaQueryOptions {
	/**
	 * As `window.matchMedia()` is unavailable on the server, it returns a default match
	 * during the first mount.
	 * @default false
	 */
	defaultMatches?: boolean | undefined;
	/**
	 * You can provide your own implementation of matchMedia. This can be used for handling
	 * an iframe content window.
	 */
	matchMedia?: typeof window.matchMedia | undefined;
	/**
	 * To perform the server-side hydration, the hook needs to render twice. A first time
	 * with `defaultMatches`, the value of the server, and a second time with the resolved
	 * value. This double pass rendering cycle comes with a drawback: it's slower. You can
	 * set this option to `true` if you use the returned value **only** client-side.
	 * @default false
	 */
	noSsr?: boolean | undefined;
	/** Your own implementation of `matchMedia`, used when rendering server-side. */
	ssrMatchMedia?: ((query: string) => { matches: boolean }) | undefined;
}

export function useMediaQuery(query: string, options?: UseMediaQueryOptions): boolean;
export function useMediaQuery(...args: any[]): boolean {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMediaQuery');

	const rawQuery = user[0] as string;
	const options = (user[1] as UseMediaQueryOptions | undefined) ?? {};

	// Wait for jsdom to support the match media feature. All the browsers Base UI supports
	// have this built-in; this defensive check is here for simplicity.
	const supportMatchMedia =
		typeof window !== 'undefined' && typeof window.matchMedia !== 'undefined';

	const normalizedQuery = rawQuery.replace(/^@media( ?)/m, '');

	const {
		defaultMatches = false,
		matchMedia = supportMatchMedia ? window.matchMedia : null,
		ssrMatchMedia = null,
		noSsr = false,
	} = options;

	const getDefaultSnapshot = useCallback(
		() => defaultMatches,
		[defaultMatches],
		subSlot(slot, 'def'),
	);

	const getServerSnapshot = useMemo(
		() => {
			if (noSsr && matchMedia) {
				return () => matchMedia(normalizedQuery).matches;
			}
			if (ssrMatchMedia !== null) {
				const { matches } = ssrMatchMedia(normalizedQuery);
				return () => matches;
			}
			return getDefaultSnapshot;
		},
		[getDefaultSnapshot, normalizedQuery, ssrMatchMedia, noSsr, matchMedia],
		subSlot(slot, 'srv'),
	);

	const [getSnapshot, subscribe] = useMemo(
		() => {
			if (matchMedia === null) {
				return [getDefaultSnapshot, () => () => {}] as const;
			}
			const mediaQueryList = matchMedia(normalizedQuery);
			return [
				() => mediaQueryList.matches,
				(notify: () => void) => addEventListener(mediaQueryList, 'change', notify),
			] as const;
		},
		[getDefaultSnapshot, matchMedia, normalizedQuery],
		subSlot(slot, 'sub'),
	);

	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot, subSlot(slot, 'store'));
}

export namespace useMediaQuery {
	export type Options = UseMediaQueryOptions;
}
