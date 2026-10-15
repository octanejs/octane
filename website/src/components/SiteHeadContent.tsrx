'use strong';

import { useEffect, useId } from 'octane';
import {
	Asset,
	DEV_STYLES_ATTR,
	getAssetKeys,
	useHydrated,
	useTags,
} from '@octanejs/tanstack-router/compiled';
import type { RouterManagedTag } from '@octanejs/tanstack-router/compiled';

// The router's <HeadContent />, minus the manifest's `modulepreload` hints.
//
// TanStack Router emits one <link rel="modulepreload"> per chunk in the boot
// graph. The entry script imports every one of those chunks anyway, and on
// this site the extra head fetches compete with the critical path: in
// simulated-throttling Lighthouse (median of 3 cold runs) dropping them moved
// LCP -9.8% and FCP -28%. That is this site's trade-off, so the filter lives
// here rather than in the binding, which keeps upstream's behavior.
//
// The same filter runs on the server and the client, so the managed keys the
// server renders are the ones the client claims.
function isModulePreload(tag: RouterManagedTag) {
	return tag.tag === 'link' && tag.attrs?.rel === 'modulepreload';
}

export function SiteHeadContent() @{
	const owner = useId();
	const hydrated = useHydrated();
	const tags = useTags().filter(
		(tag) =>
			!isModulePreload(tag) &&
			!(
				process.env.NODE_ENV !== 'production' &&
				hydrated &&
				tag.tag === 'link' &&
				tag.attrs?.[DEV_STYLES_ATTR] === true
			),
	);
	const keys = getAssetKeys('head', owner, tags);
	const assets = tags.map((tag, index) => ({ ...tag, ...keys[index]! }));

	// Dev-only: drop the dev stylesheet links once hydrated, as <HeadContent />
	// does.
	useEffect(() => {
		if (process.env.NODE_ENV === 'production' || !hydrated) {
			return;
		}
		document.querySelectorAll(`link[${DEV_STYLES_ATTR}]`).forEach((element) => element.remove());
	});

	<>
		@for (const asset of assets; key asset.assetKey) {
			<Asset {...asset} target="head" />
		}
	</>
}
