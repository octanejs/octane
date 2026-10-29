import { getWindow } from '@octanejs/dnd-kit-utilities';

export function isFixed(
	node: HTMLElement,
	computedStyle: CSSStyleDeclaration = getWindow(node).getComputedStyle(node),
): boolean {
	return computedStyle.position === 'fixed';
}
