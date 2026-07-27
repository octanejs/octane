// Ported from .base-ui/packages/react/src/utils/getCssDimensions.ts (v1.6.0). Base UI reads this
// from `@floating-ui/utils`; `round` is inlined here rather than adding an import.
import { isHTMLElement } from './dom';

export interface Dimensions {
	width: number;
	height: number;
}

export function getCssDimensions(element: Element): Dimensions {
	const css = getComputedStyle(element);
	// In testing environments the `width`/`height` properties are empty strings for SVG elements,
	// which would parse to NaN. Fall back to 0.
	let width = parseFloat(css.width) || 0;
	let height = parseFloat(css.height) || 0;
	const hasOffset = isHTMLElement(element);
	const offsetWidth = hasOffset ? (element as HTMLElement).offsetWidth : width;
	const offsetHeight = hasOffset ? (element as HTMLElement).offsetHeight : height;
	const shouldFallback =
		Math.round(width * 2) / 2 !== offsetWidth || Math.round(height * 2) / 2 !== offsetHeight;

	if (shouldFallback) {
		width = offsetWidth;
		height = offsetHeight;
	}

	return { width, height };
}
