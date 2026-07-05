// Ported from .base-ui/packages/react/src/internals/composite/composite.ts (the constants,
// `isNativeInput`, `scrollIntoViewIfNeeded`) + `@base-ui/utils/isElementDisabled`. Pure DOM
// helpers — framework-agnostic, ported verbatim.

// .base-ui/…/composite/constants.ts — marks the item that should hold the initial tab stop.
export const ACTIVE_COMPOSITE_ITEM = 'data-composite-item-active';

export const ARROW_UP = 'ArrowUp';
export const ARROW_DOWN = 'ArrowDown';
export const ARROW_LEFT = 'ArrowLeft';
export const ARROW_RIGHT = 'ArrowRight';
export const HOME = 'Home';
export const END = 'End';
export const PAGE_UP = 'PageUp';
export const PAGE_DOWN = 'PageDown';

export const HORIZONTAL_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT]);
export const HORIZONTAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT, HOME, END]);
export const VERTICAL_KEYS = new Set([ARROW_UP, ARROW_DOWN]);
export const VERTICAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_UP, ARROW_DOWN, HOME, END]);
export const ARROW_KEYS = new Set([...HORIZONTAL_KEYS, ...VERTICAL_KEYS]);
export const COMPOSITE_KEYS = new Set([...ARROW_KEYS, HOME, END]);

export const SHIFT = 'Shift' as const;
export const CONTROL = 'Control' as const;
export const ALT = 'Alt' as const;
export const META = 'Meta' as const;
export const MODIFIER_KEYS = new Set([SHIFT, CONTROL, ALT, META] as const);
export type ModifierKey = 'Shift' | 'Control' | 'Alt' | 'Meta';

export type TextDirection = 'ltr' | 'rtl';

function isHTMLElement(el: unknown): el is HTMLElement {
	return el != null && el instanceof HTMLElement;
}

function isInputElement(element: EventTarget): element is HTMLInputElement {
	return isHTMLElement(element) && element.tagName === 'INPUT';
}

export function isNativeInput(
	element: EventTarget,
): element is HTMLElement & (HTMLInputElement | HTMLTextAreaElement) {
	if (isInputElement(element) && element.selectionStart != null) {
		return true;
	}
	if (isHTMLElement(element) && element.tagName === 'TEXTAREA') {
		return true;
	}
	return false;
}

export function isElementDisabled(element: HTMLElement | null): boolean {
	return (
		element == null ||
		element.hasAttribute('disabled') ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

export function scrollIntoViewIfNeeded(
	scrollContainer: HTMLElement | null,
	element: HTMLElement | null,
	direction: TextDirection,
	orientation: 'horizontal' | 'vertical' | 'both',
): void {
	if (!scrollContainer || !element || !element.scrollTo) {
		return;
	}

	let targetX = scrollContainer.scrollLeft;
	let targetY = scrollContainer.scrollTop;

	const isOverflowingX = scrollContainer.clientWidth < scrollContainer.scrollWidth;
	const isOverflowingY = scrollContainer.clientHeight < scrollContainer.scrollHeight;

	if (isOverflowingX && orientation !== 'vertical') {
		const elementOffsetLeft = getOffset(scrollContainer, element, 'left');
		const containerStyles = getStyles(scrollContainer);
		const elementStyles = getStyles(element);

		if (direction === 'ltr') {
			if (
				elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight >
				scrollContainer.scrollLeft +
					scrollContainer.clientWidth -
					containerStyles.scrollPaddingRight
			) {
				targetX =
					elementOffsetLeft +
					element.offsetWidth +
					elementStyles.scrollMarginRight -
					scrollContainer.clientWidth +
					containerStyles.scrollPaddingRight;
			} else if (
				elementOffsetLeft - elementStyles.scrollMarginLeft <
				scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft
			) {
				targetX =
					elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
			}
		}

		if (direction === 'rtl') {
			if (
				elementOffsetLeft - elementStyles.scrollMarginRight <
				scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft
			) {
				targetX =
					elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
			} else if (
				elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight >
				scrollContainer.scrollLeft +
					scrollContainer.clientWidth -
					containerStyles.scrollPaddingRight
			) {
				targetX =
					elementOffsetLeft +
					element.offsetWidth +
					elementStyles.scrollMarginRight -
					scrollContainer.clientWidth +
					containerStyles.scrollPaddingRight;
			}
		}
	}

	if (isOverflowingY && orientation !== 'horizontal') {
		const elementOffsetTop = getOffset(scrollContainer, element, 'top');
		const containerStyles = getStyles(scrollContainer);
		const elementStyles = getStyles(element);

		if (
			elementOffsetTop - elementStyles.scrollMarginTop <
			scrollContainer.scrollTop + containerStyles.scrollPaddingTop
		) {
			targetY = elementOffsetTop - elementStyles.scrollMarginTop - containerStyles.scrollPaddingTop;
		} else if (
			elementOffsetTop + element.offsetHeight + elementStyles.scrollMarginBottom >
			scrollContainer.scrollTop + scrollContainer.clientHeight - containerStyles.scrollPaddingBottom
		) {
			targetY =
				elementOffsetTop +
				element.offsetHeight +
				elementStyles.scrollMarginBottom -
				scrollContainer.clientHeight +
				containerStyles.scrollPaddingBottom;
		}
	}

	scrollContainer.scrollTo({ left: targetX, top: targetY, behavior: 'auto' });
}

function getOffset(ancestor: HTMLElement, element: HTMLElement, side: 'left' | 'top'): number {
	const propName = side === 'left' ? 'offsetLeft' : 'offsetTop';
	let result = 0;
	let el = element;
	while (el.offsetParent) {
		result += el[propName];
		if (el.offsetParent === ancestor) {
			break;
		}
		el = el.offsetParent as HTMLElement;
	}
	return result;
}

function getStyles(element: HTMLElement): Record<string, number> {
	const styles = getComputedStyle(element);
	return {
		scrollMarginTop: parseFloat(styles.scrollMarginTop) || 0,
		scrollMarginRight: parseFloat(styles.scrollMarginRight) || 0,
		scrollMarginBottom: parseFloat(styles.scrollMarginBottom) || 0,
		scrollMarginLeft: parseFloat(styles.scrollMarginLeft) || 0,
		scrollPaddingTop: parseFloat(styles.scrollPaddingTop) || 0,
		scrollPaddingRight: parseFloat(styles.scrollPaddingRight) || 0,
		scrollPaddingBottom: parseFloat(styles.scrollPaddingBottom) || 0,
		scrollPaddingLeft: parseFloat(styles.scrollPaddingLeft) || 0,
	};
}
