import type { RouterManagedTag } from '@tanstack/router-core';

export function getAssetKey(scope: 'head' | 'body', asset: RouterManagedTag, index: number) {
	const inlineCss = asset.tag === 'style' && asset.inlineCss;
	return `${scope}:${index}:${JSON.stringify({
		tag: asset.tag,
		attrs: asset.attrs,
		children: inlineCss ? undefined : asset.children,
		inlineCss,
	})}`;
}

export function getManagedAssetKey(scope: 'head' | 'body', owner: string, index: number) {
	return `${scope}:${owner}:${index.toString(36)}`;
}
