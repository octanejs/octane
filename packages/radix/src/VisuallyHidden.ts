// Ported from @radix-ui/react-visually-hidden (source:
// .radix-primitives/packages/react/visually-hidden/src/visually-hidden.tsx). Hides content
// visually while keeping it available to assistive technology.
import { createElement } from 'octane';

import { Primitive } from './Primitive';

export const VISUALLY_HIDDEN_STYLES = Object.freeze({
	// See: https://github.com/twbs/bootstrap/blob/main/scss/mixins/_visually-hidden.scss
	position: 'absolute',
	border: 0,
	width: 1,
	height: 1,
	padding: 0,
	margin: -1,
	overflow: 'hidden',
	clip: 'rect(0, 0, 0, 0)',
	whiteSpace: 'nowrap',
	wordWrap: 'normal',
});

export function VisuallyHidden(props: any): any {
	return createElement(Primitive.span, {
		...props,
		style: { ...VISUALLY_HIDDEN_STYLES, ...props?.style },
	});
}

export { VisuallyHidden as Root };
