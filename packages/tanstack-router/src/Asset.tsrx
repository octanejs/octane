declare const process: { env: { NODE_ENV?: string; TSS_INLINE_CSS_ENABLED?: string } };

import { createElement, useLayoutEffect, useMemo, useState, useEffect } from 'octane';
import type { OctaneNode } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import type { RouterManagedTag } from '@tanstack/router-core';
import { useRouter } from './context.ts';
import { useHydrated } from './ClientOnly.tsrx';

export type AssetProps =
	RouterManagedTag & {
		assetKey?: string;
		target?: 'head' | 'body';
		nonce?: string;
		preventScriptHoist?: boolean;
	};

type ManagedAssetProps =
	AssetProps & { assetKey: string; target: 'head' | 'body'; managedKey?: string };

const MANAGED_KEY_ATTR = 'data-tsr-managed-key';

function attributeName(name: string) {
	switch (name) {
		case 'charSet':
			return 'charset';
		case 'className':
			return 'class';
		case 'crossOrigin':
			return 'crossorigin';
		case 'httpEquiv':
			return 'http-equiv';
		default:
			return name;
	}
}

function setAttributes(element: Element, attrs: RouterManagedTag['attrs']) {
	if (!attrs) {
		return;
	}
	for (const [name, value] of Object.entries(attrs)) {
		if (
			name === 'suppressHydrationWarning' || value === undefined || value === null ||
				value === false
		) {
			continue;
		}
		element.setAttribute(attributeName(name), value === true ? '' : String(value));
	}
}

function findManagedElement(parent: HTMLElement, key: string) {
	for (const element of parent.querySelectorAll(`[${MANAGED_KEY_ATTR}]`)) {
		if (element.getAttribute(MANAGED_KEY_ATTR) === key) {
			return element;
		}
	}
	return undefined;
}

function mountAsset(props: ManagedAssetProps) {
	const parent =
		props.target === 'head' ? document.head : document.body;
	const managedKey = props.managedKey ?? props.assetKey;
	const existing = findManagedElement(parent, managedKey);
	if (existing) {
		return () => existing.remove();
	}

	const element = document.createElement(props.tag);
	element.setAttribute(MANAGED_KEY_ATTR, managedKey);
	setAttributes(element, props.attrs);
	if (typeof props.children === 'string') {
		element.textContent = props.children;
	}
	parent.appendChild(element);
	return () => element.remove();
}

function ManagedAsset(props: ManagedAssetProps) @{
	const router = useRouter();
	const hydrated = useHydrated();
	const managedKey = (props as ManagedAssetProps).managedKey ?? props.assetKey;

	if (!(isServer ?? router.isServer)) {
		useLayoutEffect(() => mountAsset(props), [
			props.assetKey,
			managedKey,
			props.attrs,
			props.children,
			props.tag,
			props.target,
		]);
	}

	const visibleTag =
		(isServer ?? router.isServer) || props.target === 'body' && !hydrated ? props.tag : undefined;

	@switch (visibleTag) {
		@case 'title': {
			<title {...props.attrs} data-tsr-managed-key={managedKey}>
				{props.children ?? '' as string}
			</title>
		}
		@case 'meta': {
			<meta {...props.attrs} data-tsr-managed-key={managedKey} />
		}
		@case 'link': {
			<link {...props.attrs} data-tsr-managed-key={managedKey} />
		}
		@case 'style': {
			<>
				{createElement('style', {
					...props.attrs,
					'data-tsr-managed-key': managedKey,
					dangerouslySetInnerHTML: { __html: props.children ?? '' },
				})}
			</>
		}
		@case 'script': {
			<script
				{...props.attrs}
				data-tsr-managed-key={managedKey}
				dangerouslySetInnerHTML={{ __html: props.children ?? '' }}
			/>
		}
		@default: {
			<></>
		}
	}
}

export function Asset(props: AssetProps) {
	return props.assetKey !== undefined && props.target !== undefined
		? <ManagedAsset {...props} assetKey={props.assetKey} target={props.target} />
		: <NativeAsset {...props} />;
}

const INLINE_CSS_HYDRATION_ATTR = 'data-tsr-inline-css';

interface ScriptAttrs {
	[key: string]: string | boolean | undefined;
	src?: string;
	suppressHydrationWarning?: boolean;
}

const noopScriptHandler = () => {};

function setScriptAttrs(script: HTMLScriptElement, attrs: ScriptAttrs | undefined) {
	if (!attrs) {
		return;
	}

	for (const [key, value] of Object.entries(attrs)) {
		if (key !== 'suppressHydrationWarning' && value !== undefined && value !== false) {
			script.setAttribute(key, typeof value === 'boolean' ? '' : String(value));
		}
	}
}

function NativeAsset(asset: RouterManagedTag & {
	nonce?: string;
	preventScriptHoist?: boolean;
}): OctaneNode {
	const { attrs, children, nonce, preventScriptHoist } = asset;
	// React 19 compares this object by reference before assigning innerHTML.
	const innerHTML = useMemo(() => (children === undefined ? undefined : { __html: children }), [
		children,
	]);

	switch (asset.tag) {
		case 'title':
			return <title {...attrs} suppressHydrationWarning>{children}</title>;
		case 'meta':
			return <meta {...attrs} suppressHydrationWarning />;
		case 'link':
			return <link
				{...attrs}
				precedence={attrs?.precedence ?? (attrs?.rel === 'stylesheet' ? 'default' : undefined)}
				nonce={nonce}
				suppressHydrationWarning
			/>;
		case 'style':
			if (
				asset.inlineCss &&
					(process.env.TSS_INLINE_CSS_ENABLED === 'true' ||
						process.env.TSS_INLINE_CSS_ENABLED === undefined && isServer)
			) {
				return <InlineCssStyle attrs={attrs} nonce={nonce}>{children}</InlineCssStyle>;
			}
			return createElement('style', { ...attrs, dangerouslySetInnerHTML: innerHTML, nonce });
		case 'script':
			return <Script attrs={attrs} preventScriptHoist={preventScriptHoist}>{children}</Script>;
		default:
			return null;
	}
}

function InlineCssStyle({
	attrs,
	children,
	nonce,
}: {
	attrs?: Record<string, any>;
	children?: RouterManagedTag['children'];
	nonce?: string;
}) {
	const isInlineCssPlaceholder = children === undefined;
	const [hydratedInlineCss] = useState(() => {
		if (!isInlineCssPlaceholder || typeof document === 'undefined') {
			return undefined;
		}

		return document.querySelector<HTMLStyleElement>(
			`style[${INLINE_CSS_HYDRATION_ATTR}]`,
		)?.textContent ??
			undefined;
	});
	const html = isInlineCssPlaceholder ? hydratedInlineCss ?? '' : children ?? '';
	const innerHTML = useMemo(() => ({ __html: html }), [html]);

	return createElement('style', {
		...attrs,
		[INLINE_CSS_HYDRATION_ATTR]: '',
		dangerouslySetInnerHTML: innerHTML,
		nonce,
		suppressHydrationWarning: true,
	});
}

function Script({
	attrs,
	children,
	preventScriptHoist,
}: {
	attrs?: ScriptAttrs;
	children?: string;
	preventScriptHoist?: boolean;
}) {
	const router = useRouter();
	const hydrated = useHydrated();
	const innerHTML = useMemo(() => (children === undefined ? undefined : { __html: children }), [
		children,
	]);
	const dataScript =
		typeof attrs?.type === 'string' && attrs.type !== '' && attrs.type !== 'text/javascript' &&
			attrs.type !== 'module';

	if (
		process.env.NODE_ENV !== 'production' && attrs?.src && typeof children === 'string' &&
			children.trim().length
	) {
		console.warn(
			'[TanStack Router] <Script> received both `src` and `children`. The `children` content will be ignored. Remove `children` or remove `src`.',
		);
	}

	useEffect(() => {
		if (dataScript) {
			return;
		}

		if (attrs?.src) {
			// Anchors resolve relative URLs and preserve invalid URLs without throwing.
			const link = document.createElement('a');
			link.href = attrs.src;
			const normSrc = link.href;
			for (const el of document.scripts) {
				if (
					el.src === normSrc &&
						(attrs?.[MANAGED_KEY_ATTR] === undefined ||
							el.getAttribute(MANAGED_KEY_ATTR) === attrs[MANAGED_KEY_ATTR])
				) {
					return;
				}
			}

			const script = document.createElement('script');

			setScriptAttrs(script, attrs);

			document.head.appendChild(script);

			return () => script.remove();
		}

		if (typeof children === 'string') {
			const typeAttr =
				typeof attrs?.type === 'string' ? attrs.type : 'text/javascript';
			const nonceAttr =
				typeof attrs?.nonce === 'string' ? attrs.nonce : undefined;
			for (const el of document.scripts) {
				if (el.hasAttribute('src')) {
					continue;
				}

				const sType = el.getAttribute('type') ?? 'text/javascript';
				const sNonce = el.getAttribute('nonce') ?? undefined;
				if (
					(attrs?.[MANAGED_KEY_ATTR] === undefined ||
						el.getAttribute(MANAGED_KEY_ATTR) === attrs[MANAGED_KEY_ATTR]) &&
						el.textContent === children &&
						sType === typeAttr &&
						sNonce === nonceAttr
				) {
					return;
				}
			}

			const script = document.createElement('script');
			script.textContent = children;
			setScriptAttrs(script, attrs);

			document.head.appendChild(script);

			return () => script.remove();
		}

		return undefined;
	}, [attrs, children, dataScript]);

	// --- Server rendering ---
	if (isServer ?? router.isServer) {
		if (attrs?.src) {
			if (!preventScriptHoist) {
				return <script {...attrs} suppressHydrationWarning />;
			}

			return <script {...attrs} onLoad={noopScriptHandler} suppressHydrationWarning />;
		}

		if (typeof children === 'string') {
			return <script {...attrs} dangerouslySetInnerHTML={innerHTML} suppressHydrationWarning />;
		}

		return null;
	}

	// --- Client rendering ---

	// Data scripts (e.g. application/ld+json) are rendered in the tree;
	// the useEffect intentionally skips them.
	if (dataScript && typeof children === 'string') {
		return <script {...attrs} suppressHydrationWarning dangerouslySetInnerHTML={innerHTML} />;
	}

	// During hydration (before useEffect has fired), render the script element
	// to match the server-rendered HTML and avoid structural hydration mismatches.
	// After hydration, return null — the useEffect handles imperative injection.
	if (!hydrated) {
		if (attrs?.src) {
			return <script {...attrs} suppressHydrationWarning />;
		}

		if (typeof children === 'string') {
			return <script {...attrs} dangerouslySetInnerHTML={innerHTML} suppressHydrationWarning />;
		}
	}

	return null;
}
