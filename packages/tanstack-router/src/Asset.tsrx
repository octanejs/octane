import { createElement, useLayoutEffect } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import type { RouterManagedTag } from '@tanstack/router-core';
import { useRouter } from './context.ts';
import { useHydrated } from './ClientOnly.tsrx';

export type AssetProps =
	RouterManagedTag & {
		assetKey: string;
		target: 'head' | 'body';
	};

type ManagedAssetProps = AssetProps & { managedKey?: string };

const MANAGED_KEY_ATTR = 'data-tsr-managed-key';

// Elements currently owned by a mounted Asset. A managed key is a 32-bit
// content hash, so a collision must not let a second Asset adopt, and later
// remove, an element another Asset still owns.
const claimedElements = new WeakSet<Element>();

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
		if (element.getAttribute(MANAGED_KEY_ATTR) === key && !claimedElements.has(element)) {
			return element;
		}
	}
	return undefined;
}

function claim(element: Element) {
	claimedElements.add(element);
	return () => {
		claimedElements.delete(element);
		element.remove();
	};
}

function mountAsset(props: ManagedAssetProps) {
	const parent =
		props.target === 'head' ? document.head : document.body;
	const managedKey = props.managedKey ?? props.assetKey;
	const existing = findManagedElement(parent, managedKey);
	if (existing) {
		return claim(existing);
	}

	const element = document.createElement(props.tag);
	element.setAttribute(MANAGED_KEY_ATTR, managedKey);
	setAttributes(element, props.attrs);
	if (typeof props.children === 'string') {
		element.textContent = props.children;
	}
	parent.appendChild(element);
	return claim(element);
}

export function Asset(props: AssetProps) @{
	const router = useRouter();
	const hydrated = useHydrated();
	const managedKey = (props as ManagedAssetProps).managedKey ?? props.assetKey;

	if (!(isServer ?? router.isServer)) {
		// Compare attrs by value: a rebuilt tag list allocates new attrs objects on
		// every navigation, and an identity dependency would remove and re-add
		// unchanged assets such as the stylesheet.
		const attrsKey = JSON.stringify(props.attrs ?? null);
		useLayoutEffect(() => mountAsset(props), [
			props.assetKey,
			managedKey,
			props.tag,
			attrsKey,
			props.children,
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
			{createElement('style', {
				...props.attrs,
				'data-tsr-managed-key': managedKey,
				dangerouslySetInnerHTML: { __html: props.children ?? '' },
			})}
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
