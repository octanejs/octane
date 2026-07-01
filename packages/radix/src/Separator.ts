// Ported from @radix-ui/react-separator. A visual/semantic separator. `decorative` makes
// it presentational (role="none"); otherwise it's a `role="separator"` with an
// `aria-orientation` for the vertical case. `.ts` component via createElement.
import { createElement } from 'octane';

import { Primitive } from './Primitive';

const DEFAULT_ORIENTATION = 'horizontal';
const ORIENTATIONS = ['horizontal', 'vertical'] as const;

type Orientation = (typeof ORIENTATIONS)[number];

function isValidOrientation(orientation: any): orientation is Orientation {
	return ORIENTATIONS.includes(orientation);
}

export function Separator(props: any): any {
	const {
		decorative,
		orientation: orientationProp = DEFAULT_ORIENTATION,
		...domProps
	} = props ?? {};
	const orientation = isValidOrientation(orientationProp) ? orientationProp : DEFAULT_ORIENTATION;
	// `aria-orientation` defaults to horizontal, so only set it for vertical.
	const ariaOrientation = orientation === 'vertical' ? orientation : undefined;
	const semanticProps = decorative
		? { role: 'none' }
		: { 'aria-orientation': ariaOrientation, role: 'separator' };
	return createElement(Primitive.div, {
		'data-orientation': orientation,
		...semanticProps,
		...domProps,
	});
}

export { Separator as Root };
