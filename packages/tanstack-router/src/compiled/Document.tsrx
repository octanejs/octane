'use strong';

declare const process: { env: { NODE_ENV?: string } };

import {
	useEffect,
	useId,
	HYDRATION_RANGE_BOUNDARY,
	createPortal,
	useSyncExternalStore,
} from 'octane';
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

const subscribeToHead = () => () => {};
const getHead = () => (typeof document === 'undefined' ? null : document.head);

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

// The document elements are built imperatively, as element descriptors, and
// only the server renders them. A client build resolves `isServer` to `false`,
// so each of these folds to `null` and the bundle drops its server document.
function DocumentHtml(props: HtmlProps) @{
	const { children, ...attrs } = props;
	<html {...attrs}>{children}</html>
}
function DocumentHead(props: HeadProps) @{
	const { children, ...attrs } = props;
	<head {...attrs}>{children}</head>
}
function DocumentBody(props: BodyProps) @{
	const { children, ...attrs } = props;
	<body {...attrs}>
		<div id="__app">
			<HydrationRangeOwner children={children} />
		</div>
	</body>
}
const ServerHtml = (isServer === false ? null : DocumentHtml) as typeof DocumentHtml;
const ServerHead = (isServer === false ? null : DocumentHead) as typeof DocumentHead;
const ServerBody = (isServer === false ? null : DocumentBody) as typeof DocumentBody;

// Preserve the ordinary document and hydration-range ownership. Start owns
// the outer passthrough boundary; this entry reads the compiled router context.
export function Html(props: HtmlProps) @{
	const router = useRouter();
	@if (isServer ?? router.isServer) {
		<ServerHtml {...props} />
	} @else {
		<>{props.children}</>
	}
}

export function Head(props: HeadProps) @{
	const router = useRouter();
	@if (isServer ?? router.isServer) {
		<ServerHead {...props} />
	} @else {
		// The head portal participates in the first client hydration render, so its
		// children and the body keep the server's shared useId sequence.
		const target = useSyncExternalStore(subscribeToHead, getHead, getHead);
		@if (target) {
			<>
				{createPortal(() => @{
					<>{props.children}</>
				}, target)}
			</>
		}
	}
}

export function Body(props: BodyProps) @{
	const router = useRouter();
	@if (isServer ?? router.isServer) {
		<ServerBody {...props} />
	} @else {
		<HydrationRangeOwner children={props.children} />
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
