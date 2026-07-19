// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/collections/Hidden.tsx).
// octane adaptations (docs/aria-migration-plan.md §2a): upstream hides the
// structural copy inside a real `<template>` element (and monkey-patches
// HTMLTemplateElement for React hydration — dropped, React-specific). octane's
// hidden copy instead portals into a DETACHED, never-attached real container:
// the content renders and updates normally but is not in the document, so it is
// invisible and outside the accessible tree — the same "render structural copy
// only" contract. `CollectionBuilder` passes the Document's own detached root
// as `target` so ref registration and the real-DOM walk observe the copy;
// standalone `Hidden` uses a private detached container. During SSR the
// children render in place WITHOUT a portal (octane SSR has none): collection
// components take the render-phase SSR registration path and emit no HTML, and
// hideable components render null. `.tsx` → `.ts` (JSX → createElement), no
// forwardRef (octane refs are props), S()/subSlot component-slot convention.
import { createContext, createElement, createPortal, Fragment, useContext, useState } from 'octane';
import { useIsSSR } from '../ssr/SSRProvider';

import { S, subSlot } from '../internal';

export const HiddenContext = createContext<boolean>(false);

export function Hidden(props: { children: any; target?: Element | null }): any {
	const slot = S('Hidden');
	let isHidden = useContext(HiddenContext);
	let isSSR = useIsSSR(subSlot(slot, 'ssr'));
	// A private detached container for standalone use (never attached to the
	// document). Client-only: SSR renders no portal.
	let [ownContainer] = useState(
		() => (typeof document !== 'undefined' ? document.createElement('div') : null),
		subSlot(slot, 'container'),
	);

	if (isHidden) {
		// Don't hide again if we are already hidden.
		return props.children;
	}

	let children = createElement(HiddenContext.Provider, {
		value: true,
		children: props.children,
	});

	if (isSSR) {
		// Render-phase SSR registration path: hidden collection content emits no
		// HTML of its own (see useSSRCollectionNode), so nothing user-visible is
		// serialized. PHASE-8: SSR/hydration coverage deferred.
		return children;
	}

	// Upstream renders the structural copy inside a real in-DOM `<template>`
	// element (children redirected into its inert `.content` fragment), so
	// react-aria's serialized DOM contains an empty `<template></template>`
	// marker. Our copy lives in the detached container instead, but we render
	// the same inert placeholder so consumer-observable DOM (and the
	// differential byte-compare) matches react-aria exactly.
	return createElement(
		Fragment,
		null,
		createElement('template', null),
		createPortal(children, (props.target ?? ownContainer) as Element),
	);
}

/** Creates a component that returns null if it is in a hidden subtree. */
export function createHideableComponent<T, P = {}>(
	fn: (props: P, ref: any) => any,
): (props: P & { ref?: any }) => any {
	// octane adaptation: no forwardRef — the ref arrives as a normal prop and is
	// forwarded to `fn` in upstream's (props, ref) positional shape.
	let Wrapper = (props: P & { ref?: any }) => {
		let isHidden = useContext(HiddenContext);
		if (isHidden) {
			return null;
		}

		return fn(props, (props as any).ref);
	};
	return Wrapper;
}

/** Returns whether the component is in a hidden subtree. */
export function useIsHidden(): boolean {
	return useContext(HiddenContext);
}
