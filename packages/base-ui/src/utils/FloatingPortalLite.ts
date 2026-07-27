// Ported from .base-ui/packages/react/src/utils/FloatingPortalLite.tsx (v1.6.0). `FloatingPortal`
// also carries the tabbable/focus-guard machinery; components that don't need it (Tooltip,
// PreviewCard, Toast) use this thinner variant, which only creates the portal node and renders the
// children into it.
//
// octane adaptations: forwardRef → ref-as-prop; `createElement` instead of JSX; `ReactDOM`'s
// `createPortal` → octane's.
import { createElement, createPortal, Fragment } from 'octane';

import { S, subSlot } from '../internal';
import { useFloatingPortalNode } from './floating/FloatingPortal';

export function FloatingPortalLite(componentProps: any): any {
	const slot = S('FloatingPortalLite');
	const { children, container, className, render, style, ref, ...elementProps } = componentProps;

	const { portalNode, portalSubtree } = useFloatingPortalNode(
		{ container, ref, componentProps: { render, className, style }, elementProps },
		subSlot(slot, 'node'),
	);

	if (!portalSubtree && !portalNode) {
		return null;
	}

	return createElement(Fragment, {
		children: [portalSubtree, portalNode ? createPortal(children, portalNode) : null],
	});
}
