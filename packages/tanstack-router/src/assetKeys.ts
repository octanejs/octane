import type { RouterManagedTag } from '@tanstack/router-core';

export type AssetKeys = { assetKey: string; managedKey: string };

function assetContent(asset: RouterManagedTag) {
	const inlineCss = asset.tag === 'style' && asset.inlineCss;
	return JSON.stringify({
		tag: asset.tag,
		attrs: asset.attrs,
		children: inlineCss ? undefined : asset.children,
		inlineCss,
	});
}

// FNV-1a, so the managed-key attribute stays short on the SSR element.
function hashContent(content: string) {
	let hash = 0x811c9dc5;
	for (let i = 0; i < content.length; i++) {
		hash ^= content.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

// Keys derive from each tag's content, never its list position. A navigation
// that adds or removes a route's preload links shifts every later tag's index;
// an index-based key remounts the asset, which removes and re-adds the
// stylesheet link and flashes unstyled content. Identical tags are told apart
// by occurrence count.
export function getAssetKeys(
	scope: 'head' | 'body',
	owner: string,
	assets: ReadonlyArray<RouterManagedTag>,
): Array<AssetKeys> {
	const seen = new Map<string, number>();
	return assets.map((asset) => {
		const content = assetContent(asset);
		const occurrence = seen.get(content) ?? 0;
		seen.set(content, occurrence + 1);
		return {
			assetKey: `${scope}:${occurrence}:${content}`,
			managedKey: `${scope}:${owner}:${hashContent(content)}:${occurrence.toString(36)}`,
		};
	});
}
