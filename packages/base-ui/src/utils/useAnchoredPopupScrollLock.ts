// Ported from .base-ui/packages/react/src/utils/useAnchoredPopupScrollLock.ts (v1.6.0),
// octane-adapted (slot-threaded). Touch-opened popups normally skip scroll lock so a swipe outside
// can still dismiss; this re-enables scroll lock only when the popup is effectively full-width
// (leaving too little outside space for a reliable swipe).
import { useState, useLayoutEffect } from 'octane';

import { S, subSlot } from '../internal';
import { ownerDocument } from './owner';
import { useScrollLock } from './useScrollLock';

const VIEWPORT_WIDTH_TOLERANCE_PX = 20;

export function useAnchoredPopupScrollLock(
	enabled: boolean,
	touchOpen: boolean,
	positionerElement: HTMLElement | null,
	referenceElement: Element | null,
): void {
	const slot = S('useAnchoredPopupScrollLock');
	const [touchOpenShouldLockScroll, setTouchOpenShouldLockScroll] = useState(
		false,
		subSlot(slot, 'lock'),
	);

	useLayoutEffect(
		() => {
			if (!enabled || !touchOpen || positionerElement == null) {
				setTouchOpenShouldLockScroll(false);
				return;
			}

			const viewportWidth = ownerDocument(positionerElement).documentElement.clientWidth;
			const popupWidth = positionerElement.offsetWidth;

			setTouchOpenShouldLockScroll(
				viewportWidth > 0 &&
					popupWidth > 0 &&
					popupWidth >= viewportWidth - VIEWPORT_WIDTH_TOLERANCE_PX,
			);
		},
		[enabled, touchOpen, positionerElement],
		subSlot(slot, 'eff'),
	);

	useScrollLock(
		enabled && (!touchOpen || touchOpenShouldLockScroll),
		referenceElement,
		subSlot(slot, 'scroll'),
	);
}
