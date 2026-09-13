// useElementScrollRestoration — restore scroll for a specific element (e.g. a
// virtualized list) by id or getter. Port of react-router's
// ScrollRestoration.tsx helper: ensures the router's scroll restoration is set
// up, then reads the element's stored entry from the scroll-restoration cache.
import { setupScrollRestoration, getElementScrollRestorationEntry } from '@tanstack/router-core';
import { useRouter } from './context';

export function useElementScrollRestoration(
	options: Parameters<typeof getElementScrollRestorationEntry>[1],
) {
	const router = useRouter();
	setupScrollRestoration(router, true);
	return getElementScrollRestorationEntry(router, options);
}
