import { createElement, useEffect, useId } from 'octane';
import { Asset, DEV_STYLES_ATTR, useHydrated, useTags } from '@octanejs/tanstack-router';
import type { AssetProps, RouterManagedTag } from '@octanejs/tanstack-router';

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

function assetIdentity(tag: RouterManagedTag, index: number) {
	const identity = JSON.stringify({ tag: tag.tag, attrs: tag.attrs, children: tag.children });
	return `head:${index}:${identity}`;
}

export function SiteHeadContent() @{
	const owner = useId();
	const hydrated = useHydrated();
	const tags = useTags().filter(
		(tag) =>
			!isModulePreload(tag) &&
				!(process.env.NODE_ENV !== 'production' && hydrated && tag.tag === 'link' &&
					tag.attrs?.[DEV_STYLES_ATTR] === true),
	);

	// Dev-only: drop the dev stylesheet links once hydrated, as <HeadContent />
	// does.
	useEffect(() => {
		if (process.env.NODE_ENV === 'production' || !hydrated) {
			return;
		}
		document.querySelectorAll(`link[${DEV_STYLES_ATTR}]`).forEach((element) => element.remove());
	}, [hydrated]);

	<>
		{tags.map(
			(tag, index) => createElement<AssetProps & { key?: string }>(Asset, {
				...tag,
				// A short, position-scoped key keeps the rendered
				// data-tsr-managed-key attribute small; `key` carries identity.
				assetKey: `head:${owner}:${index.toString(36)}`,
				target: 'head',
				key: assetIdentity(tag, index),
			}),
		)}
	</>
}
