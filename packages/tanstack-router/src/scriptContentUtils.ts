import { composeSsrBodyScripts, deepEqual, getSsrBodyScriptParts } from '@tanstack/router-core';
import { isServer } from '@tanstack/router-core/isServer';
import { useRouter } from './context';
import { splitSlot, subSlot } from './internal';
import { useStore } from './useStore';
import type { AnyRouteMatch, RouterManagedTag } from '@tanstack/router-core';

// router-core 1.171.34 composes body scripts through `getSsrBodyScriptParts` +
// `composeSsrBodyScripts`, and the initial hydration `<Scripts>` take moved from
// the removed `serverSsr.takeBufferedScripts()` (a single buffered tag) to
// `serverSsr.takeInitialHydrationScriptTags()` (hydration tags plus the streaming
// boundary), which `composeSsrBodyScripts` interleaves.
const routeScriptAttrs = { suppressHydrationWarning: true };

export function useScripts(...args: Array<unknown>): Array<RouterManagedTag> {
	const [, slot] = splitSlot(args);
	const router = useRouter();
	const nonce = router.options.ssr?.nonce;
	const getScripts = (matches: Array<AnyRouteMatch>) =>
		composeSsrBodyScripts(
			getSsrBodyScriptParts(matches, router.ssr?.manifest, nonce, routeScriptAttrs),
		);

	if (isServer ?? router.isServer) {
		return composeSsrBodyScripts(
			getSsrBodyScriptParts(
				router.stores.matches.get(),
				router.ssr?.manifest,
				nonce,
				routeScriptAttrs,
			),
			router.serverSsr?.takeInitialHydrationScriptTags(),
		);
	}

	return useStore(router.stores.matches, getScripts, deepEqual, subSlot(slot, 'body:scripts'));
}
