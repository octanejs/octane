// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/focusWithoutScrolling.ts).

import type { FocusableElement } from '@react-types/shared';

// This is a polyfill for element.focus({preventScroll: true});
// Currently necessary for Safari and old Edge:
// https://caniuse.com/#feat=mdn-api_htmlelement_focus_preventscroll_option
// See https://bugs.webkit.org/show_bug.cgi?id=178583
//

// Original licensing for the following methods can be found in the
// NOTICE file in the root directory of this source tree.
// See https://github.com/calvellido/focus-options-polyfill

interface ScrollableElement {
	element: HTMLElement;
	scrollTop: number;
	scrollLeft: number;
}

export function focusWithoutScrolling(element: FocusableElement): void {
	if (supportsPreventScroll()) {
		element.focus({ preventScroll: true });
	} else {
		let scrollableElements = getScrollableElements(element);
		element.focus();
		restoreScrollPosition(scrollableElements);
	}
}

let supportsPreventScrollCached: boolean | null = null;
function supportsPreventScroll() {
	if (supportsPreventScrollCached == null) {
		supportsPreventScrollCached = false;
		try {
			let focusElem = document.createElement('div');
			focusElem.focus({
				get preventScroll() {
					supportsPreventScrollCached = true;
					return true;
				},
			});
		} catch {
			// Ignore
		}
	}

	return supportsPreventScrollCached;
}

function getScrollableElements(element: FocusableElement): ScrollableElement[] {
	let parent = element.parentNode;
	let scrollableElements: ScrollableElement[] = [];
	let rootScrollingElement = document.scrollingElement || document.documentElement;

	while (parent instanceof HTMLElement && parent !== rootScrollingElement) {
		if (parent.offsetHeight < parent.scrollHeight || parent.offsetWidth < parent.scrollWidth) {
			scrollableElements.push({
				element: parent,
				scrollTop: parent.scrollTop,
				scrollLeft: parent.scrollLeft,
			});
		}
		parent = parent.parentNode;
	}

	if (rootScrollingElement instanceof HTMLElement) {
		scrollableElements.push({
			element: rootScrollingElement,
			scrollTop: rootScrollingElement.scrollTop,
			scrollLeft: rootScrollingElement.scrollLeft,
		});
	}

	return scrollableElements;
}

function restoreScrollPosition(scrollableElements: ScrollableElement[]) {
	for (let { element, scrollTop, scrollLeft } of scrollableElements) {
		element.scrollTop = scrollTop;
		element.scrollLeft = scrollLeft;
	}
}
