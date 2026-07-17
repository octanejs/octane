// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/isFocusable.ts).

import { getOwnerWindow } from './domHelpers';
import { isElementVisible } from './isElementVisible';

const focusableElements = [
	'input:not([disabled]):not([type=hidden])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'button:not([disabled])',
	'a[href]',
	'area[href]',
	'summary',
	'iframe',
	'object',
	'embed',
	'audio[controls]',
	'video[controls]',
	'[contenteditable]:not([contenteditable^="false"])',
	'permission',
];

const FOCUSABLE_ELEMENT_SELECTOR =
	focusableElements.join(':not([hidden]),') + ',[tabindex]:not([disabled]):not([hidden])';

focusableElements.push('[tabindex]:not([tabindex="-1"]):not([disabled])');
const TABBABLE_ELEMENT_SELECTOR = focusableElements.join(':not([hidden]):not([tabindex="-1"]),');

export function isFocusable(
	element: Element,
	options?: { skipVisibilityCheck?: boolean },
): boolean {
	return (
		element.matches(FOCUSABLE_ELEMENT_SELECTOR) &&
		!isInert(element) &&
		(options?.skipVisibilityCheck || isElementVisible(element))
	);
}

export function isTabbable(element: Element): boolean {
	return (
		element.matches(TABBABLE_ELEMENT_SELECTOR) && isElementVisible(element) && !isInert(element)
	);
}

function isInert(element: Element): boolean {
	let node: Element | null = element;
	while (node != null) {
		if (node instanceof getOwnerWindow(node).HTMLElement && node.inert) {
			return true;
		}

		node = node.parentElement;
	}

	return false;
}
