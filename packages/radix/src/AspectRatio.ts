// Ported from @radix-ui/react-aspect-ratio (source:
// .radix-primitives/packages/react/aspect-ratio/src/aspect-ratio.tsx). Constrains content
// to a ratio via the padding-bottom trick on a wrapper div.
import { createElement } from 'octane';

import { Primitive } from './Primitive';

export function AspectRatio(props: any): any {
	const { ratio = 1 / 1, style, ...aspectRatioProps } = props ?? {};
	return createElement('div', {
		style: {
			// ensures inner element is contained
			position: 'relative',
			// ensures padding bottom trick maths works
			width: '100%',
			paddingBottom: `${100 / ratio}%`,
		},
		'data-radix-aspect-ratio-wrapper': '',
		children: createElement(Primitive.div, {
			...aspectRatioProps,
			style: {
				...style,
				// ensures children expand in ratio
				position: 'absolute',
				top: 0,
				right: 0,
				bottom: 0,
				left: 0,
			},
		}),
	});
}

export { AspectRatio as Root };
