// Ported from @radix-ui/react-arrow (source:
// .radix-primitives/packages/react/arrow/src/arrow.tsx). The default popper arrow: a
// 30×10 viewBox svg polygon, stretchable via width/height.
import { createElement } from 'octane';

import { Primitive } from './Primitive';

export function Arrow(props: any): any {
	const { children, width = 10, height = 5, ...arrowProps } = props ?? {};
	return createElement(Primitive.svg, {
		...arrowProps,
		width,
		height,
		viewBox: '0 0 30 10',
		preserveAspectRatio: 'none',
		// We use their children if they're slotting to replace the whole svg.
		children: props?.asChild ? children : createElement('polygon', { points: '0,0 30,0 15,10' }),
	});
}

export { Arrow as Root };
