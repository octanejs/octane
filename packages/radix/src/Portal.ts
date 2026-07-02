// Ported from @radix-ui/react-portal. Renders `Primitive.div` (or, with `asChild`, the
// child itself) into `container` (default: document.body) — React's ReactDOM.createPortal
// → octane's `createPortal`-as-a-value. The `mounted` layout-effect gate mirrors Radix's
// SSR-safety dance (no document during server render; flips on first client commit).
import { createElement, createPortal, useLayoutEffect, useState } from 'octane';

import { S, subSlot } from './internal';
import { Primitive } from './Primitive';

export function Portal(props: any): any {
	const slot = S('Portal');
	const { container: containerProp, ...portalProps } = props ?? {};
	const [mounted, setMounted] = useState(false, subSlot(slot, 'mounted'));
	useLayoutEffect(() => setMounted(true), [], subSlot(slot, 'e:mount'));
	const container = containerProp || (mounted && globalThis?.document?.body);
	return container ? createPortal(createElement(Primitive.div, portalProps), container) : null;
}

export { Portal as Root };
