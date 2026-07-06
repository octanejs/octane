// Ported from .base-ui/packages/react/src/floating-ui-react/utils/composite.ts — the visibility
// helpers the tabbable walk needs.
import { getComputedStyle } from '@floating-ui/utils/dom';

export function isHiddenByStyles(styles: CSSStyleDeclaration): boolean {
	return styles.visibility === 'hidden' || styles.visibility === 'collapse';
}

export function isElementVisible(
	element: Element | null,
	styles: CSSStyleDeclaration | null = element ? getComputedStyle(element) : null,
): boolean {
	if (!element || !element.isConnected || !styles || isHiddenByStyles(styles)) {
		return false;
	}
	if (typeof (element as any).checkVisibility === 'function') {
		return (element as any).checkVisibility();
	}
	return styles.display !== 'none' && styles.display !== 'contents';
}
