import { dynamic } from '@solidjs/web';
import { ICONS } from './data.js';

// Lucide-shaped runtime icon: Solid's dynamic-tag path (`dynamic()` over the
// shared [tag, attrs] tuples — <Dynamic> is deprecated in 2.0), the mechanism
// lucide-solid uses. Every icon variant has exactly two shapes, so the
// positions are unrolled — a same-tag variant change patches attributes while
// a tag change swaps the element, matching the sibling fixtures' semantics.
export function Icon(props) {
	const Shape0 = dynamic(() => ICONS[props.name][0][0]);
	const Shape1 = dynamic(() => ICONS[props.name][1][0]);
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={'lucide i-' + props.name}
		>
			<Shape0 {...ICONS[props.name][0][1]} />
			<Shape1 {...ICONS[props.name][1][1]} />
		</svg>
	);
}
