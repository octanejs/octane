// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/focusSafely.ts).
import type { FocusableElement } from '@react-types/shared';

import { focusWithoutScrolling } from '../utils/focusWithoutScrolling';
import { getActiveElement } from '../utils/shadowdom/DOMFunctions';
import { getInteractionModality } from './useFocusVisible';
import { getOwnerDocument } from '../utils/domHelpers';
import { runAfterTransition } from '../utils/runAfterTransition';

/**
 * A utility function that focuses an element while avoiding undesired side effects such
 * as page scrolling and screen reader issues with CSS transitions.
 */
export function focusSafely(element: FocusableElement): void {
	if (!element.isConnected) {
		return;
	}

	// If the user is interacting with a virtual cursor, e.g. screen reader, then
	// wait until after any animated transitions that are currently occurring on
	// the page before shifting focus. This avoids issues with VoiceOver on iOS
	// causing the page to scroll when moving focus if the element is transitioning
	// from off the screen.
	const ownerDocument = getOwnerDocument(element);
	if (getInteractionModality() === 'virtual') {
		let lastFocusedElement = getActiveElement(ownerDocument);
		runAfterTransition(() => {
			const activeElement = getActiveElement(ownerDocument);
			// If focus did not move or focus was lost to the body, and the element is still in the document, focus it.
			if (
				(activeElement === lastFocusedElement || activeElement === ownerDocument.body) &&
				element.isConnected
			) {
				focusWithoutScrolling(element);
			}
		});
	} else {
		focusWithoutScrolling(element);
	}
}
