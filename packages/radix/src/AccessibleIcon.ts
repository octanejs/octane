// Ported from @radix-ui/react-accessible-icon (source:
// .radix-primitives/packages/react/accessible-icon/src/accessible-icon.tsx). Hides the
// icon child from ATs (aria-hidden + unfocusable SVG) and announces `label` through a
// VisuallyHidden copy instead — `alt` text for icons. octane note: like Slot/asChild,
// the icon child must be an element DESCRIPTOR (prop/value-position JSX or
// createElement); a single-element array unwraps, matching the Slot convention.
import { Children, cloneElement, createElement } from 'octane';

import * as VisuallyHiddenPrimitive from './VisuallyHidden';

export function Root(props: any): any {
	const { children, label } = props ?? {};
	const array = Children.toArray(children);
	const child = array.length === 1 ? array[0] : Children.only(children);
	return [
		cloneElement(child as any, {
			// accessibility
			'aria-hidden': 'true',
			focusable: 'false', // See: https://allyjs.io/tutorials/focusing-in-svg.html#making-svg-elements-focusable
			key: 'icon',
		}),
		createElement(VisuallyHiddenPrimitive.Root, { key: 'label', children: label }),
	];
}

export { Root as AccessibleIcon };
