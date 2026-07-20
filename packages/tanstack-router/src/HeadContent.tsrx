import { createElement, useEffect } from 'octane';
import { DEV_STYLES_ATTR } from '@tanstack/router-core';
import type { AssetCrossOriginConfig } from '@tanstack/router-core';
import { Asset } from './Asset.tsrx';
import type { AssetProps } from './Asset.tsrx';
import { getAssetKey } from './assetKeys.ts';
import { useTags } from './headContentUtils.ts';
import { useHydrated } from './ClientOnly.tsrx';

export interface HeadContentProps {
	assetCrossOrigin?: AssetCrossOriginConfig;
}

export function HeadContent(props: HeadContentProps) @{
	const tags = useTags(props.assetCrossOrigin);
	const hydrated = useHydrated();

	useEffect(() => {
		if (process.env.NODE_ENV === 'production' || !hydrated) {
			return;
		}
		document.querySelectorAll(`link[${DEV_STYLES_ATTR}]`).forEach((element) => element.remove());
	}, [hydrated]);

	const filteredTags =
		process.env.NODE_ENV !== 'production' && hydrated
			? tags.filter((tag) => tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true)
			: tags;
	<>
		{filteredTags.map(
			(tag, index) => // `key` is lifted out of props by createElement (React semantics); the
			// explicit type argument admits it alongside the AssetProps shape.
			createElement<AssetProps & { key?: string }>(Asset, {
				...tag,
				assetKey: getAssetKey('head', tag, index),
				target: 'head',
				key: getAssetKey('head', tag, index),
			}),
		)}
	</>
}
