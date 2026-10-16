'use strong';

declare const process: { env: { NODE_ENV?: string } };

import { useEffect, useId, HYDRATION_RANGE_BOUNDARY, createPortal, useState } from 'octane';
import { DEV_STYLES_ATTR } from '@tanstack/router-core';
import type { AssetCrossOriginConfig } from '@tanstack/router-core';
import { createAsset } from '../assetComponent.tsrx';
import { createUseTags } from '../headContentBinding';
import { createUseScripts } from '../scriptContentBinding';
import { createScripts } from '../scriptComponent.tsrx';
import { getAssetKeys } from '../assetKeys';
import { useHydrated } from '../ClientOnly.tsrx';
import { useRouter } from './bindings';

import { isServer } from '@tanstack/router-core/isServer';

import type { HtmlProps } from '../Html';
import type { HeadProps } from '../Head';
import type { BodyProps } from '../Body';

// This boundary returns the authored children directly, as the ordinary Body
// owner does. Adding a template frame here changes the SSR range it claims.
function HydrationRangeOwner(props: Pick<BodyProps, 'children'>) {
	return props.children;
}

(
	HydrationRangeOwner as typeof HydrationRangeOwner & {
		[HYDRATION_RANGE_BOUNDARY]: 'owner';
	}
)[HYDRATION_RANGE_BOUNDARY] = 'owner';

// Preserve the ordinary document and hydration-range ownership. Start owns
// the outer passthrough boundary; this entry reads the compiled router context.
export function Html(props: HtmlProps) @{
	const router = useRouter();
	const { children, ...attrs } = props;
	@if (isServer ?? router.isServer) {
		<html {...attrs}>{children}</html>
	} @else {
		<>{children}</>
	}
}

export function Head(props: HeadProps) @{
	const router = useRouter();
	const { children, ...attrs } = props;
	@if (isServer ?? router.isServer) {
		<head {...attrs}>{children}</head>
	} @else {
		// Capture the portal target once, before client adoption. This is a
		// browser handle, not state copied from a post-hydration effect.
		const [target] = useState(() => (typeof document === 'undefined' ? null : document.head));
		@if (target) {
			<>
				{createPortal(() => @{
					<>{children}</>
				}, target)}
			</>
		}
	}
}

export function Body(props: BodyProps) @{
	const router = useRouter();
	const { children, ...attrs } = props;
	@if (isServer ?? router.isServer) {
		<body {...attrs}>
			<div id="__app">
				<HydrationRangeOwner children={children} />
			</div>
		</body>
	} @else {
		<HydrationRangeOwner children={children} />
	}
}
export const Asset = createAsset(useRouter);
export const useTags = createUseTags(useRouter);
const useScripts = createUseScripts(useRouter);
export const Scripts = createScripts(useScripts);

export function HeadContent(props: { assetCrossOrigin?: AssetCrossOriginConfig }) @{
	const owner = useId();
	const tags = useTags(props.assetCrossOrigin);
	const hydrated = useHydrated();
	useEffect(() => {
		if (process.env.NODE_ENV !== 'production' && hydrated) {
			document.querySelectorAll(`link[${DEV_STYLES_ATTR}]`).forEach((element) => element.remove());
		}
	});
	const filtered =
		process.env.NODE_ENV !== 'production' && hydrated
			? tags.filter((tag) => tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true)
			: tags;
	const keys = getAssetKeys('head', owner, filtered);
	const assets = filtered.map((tag, index) => ({ ...tag, ...keys[index]! }));
	<>
		@for (const asset of assets; key asset.assetKey) {
			<Asset {...asset} target="head" />
		}
	</>
}
