// Ported verbatim from .base-ui/packages/react/src/slider/utils/getMidpoint.ts. The `Coords`
// type (`@floating-ui/utils`) is inlined.
export interface Coords {
	x: number;
	y: number;
}

export function getMidpoint(element: Element): Coords {
	const rect = element.getBoundingClientRect();
	return {
		x: (rect.left + rect.right) / 2,
		y: (rect.top + rect.bottom) / 2,
	};
}
