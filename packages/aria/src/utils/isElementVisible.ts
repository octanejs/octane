// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/isElementVisible.ts).

import { getOwnerWindow } from './domHelpers';

const supportsCheckVisibility =
	typeof Element !== 'undefined' && 'checkVisibility' in Element.prototype;

function isStyleVisible(element: Element) {
	const windowObject = getOwnerWindow(element);
	if (
		!(element instanceof windowObject.HTMLElement) &&
		!(element instanceof windowObject.SVGElement)
	) {
		return false;
	}

	let { display, visibility } = element.style;

	let isVisible = display !== 'none' && visibility !== 'hidden' && visibility !== 'collapse';

	if (isVisible) {
		const { getComputedStyle } = getOwnerWindow(element);
		let { display: computedDisplay, visibility: computedVisibility } = getComputedStyle(element);

		isVisible =
			computedDisplay !== 'none' &&
			computedVisibility !== 'hidden' &&
			computedVisibility !== 'collapse';
	}

	return isVisible;
}

function isAttributeVisible(element: Element, childElement?: Element) {
	return (
		!element.hasAttribute('hidden') &&
		// Ignore HiddenSelect when tree walking.
		!element.hasAttribute('data-react-aria-prevent-focus') &&
		(element.nodeName === 'DETAILS' && childElement && childElement.nodeName !== 'SUMMARY'
			? element.hasAttribute('open')
			: true)
	);
}

/**
 * Adapted from https://github.com/testing-library/jest-dom and
 * https://github.com/vuejs/vue-test-utils-next/.
 * Licensed under the MIT License.
 *
 * @param element - Element to evaluate for display or visibility.
 */
export function isElementVisible(element: Element, childElement?: Element): boolean {
	if (supportsCheckVisibility) {
		return (
			element.checkVisibility({ visibilityProperty: true }) &&
			!element.closest('[data-react-aria-prevent-focus]')
		);
	}

	return (
		element.nodeName !== '#comment' &&
		isStyleVisible(element) &&
		isAttributeVisible(element, childElement) &&
		(!element.parentElement || isElementVisible(element.parentElement, element))
	);
}
