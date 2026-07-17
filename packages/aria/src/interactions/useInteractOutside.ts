// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useInteractOutside.ts).
// octane adaptations:
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; the
//   explicit `[ref, isDisabled]` effect deps are preserved exactly.
// - Upstream's untyped handler/validator params are typed loosely (native events).

// Portions of the code in this file are based on code from react.
// Original licensing for the following can be found in the
// NOTICE file in the root directory of this source tree.
// See https://github.com/facebook/react/tree/cc7c1aece46a6b69b41958d731e0fd27c94bfc6c/packages/react-interactions

import type { RefObject } from '@react-types/shared';
import { useEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import { getOwnerDocument } from '../utils/domHelpers';
import { useEffectEvent } from '../utils/useEffectEvent';

export interface InteractOutsideProps {
	ref: RefObject<Element | null>;
	onInteractOutside?: (e: PointerEvent) => void;
	onInteractOutsideStart?: (e: PointerEvent) => void;
	/** Whether the interact outside events should be disabled. */
	isDisabled?: boolean;
}

/**
 * Example, used in components like Dialogs and Popovers so they can close
 * when a user clicks outside them.
 */
export function useInteractOutside(props: InteractOutsideProps): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useInteractOutside(props: InteractOutsideProps, slot: symbol | undefined): void;
export function useInteractOutside(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useInteractOutside');
	const props = user[0] as InteractOutsideProps;

	let { ref, onInteractOutside, isDisabled, onInteractOutsideStart } = props;
	let stateRef = useRef(
		{
			isPointerDown: false,
			ignoreEmulatedMouseEvents: false,
		},
		subSlot(slot, 'state'),
	);

	let onPointerDown = useEffectEvent(
		(e: any) => {
			if (onInteractOutside && isValidEvent(e, ref)) {
				if (onInteractOutsideStart) {
					onInteractOutsideStart(e);
				}
				stateRef.current.isPointerDown = true;
			}
		},
		subSlot(slot, 'pointerDown'),
	);

	let triggerInteractOutside = useEffectEvent(
		(e: PointerEvent) => {
			if (onInteractOutside) {
				onInteractOutside(e);
			}
		},
		subSlot(slot, 'trigger'),
	);

	useEffect(
		() => {
			let state = stateRef.current;
			if (isDisabled) {
				return;
			}

			const element = ref.current;
			const documentObject = getOwnerDocument(element);

			// Use pointer events if available. Otherwise, fall back to mouse and touch events.
			if (typeof PointerEvent !== 'undefined') {
				let onClick = (e: any) => {
					if (state.isPointerDown && isValidEvent(e, ref)) {
						triggerInteractOutside(e);
					}
					state.isPointerDown = false;
				};

				// changing these to capture phase fixed combobox
				// Use click instead of pointerup to avoid Android Chrome issue
				// https://issues.chromium.org/issues/40732224
				documentObject.addEventListener('pointerdown', onPointerDown, true);
				documentObject.addEventListener('click', onClick, true);

				return () => {
					documentObject.removeEventListener('pointerdown', onPointerDown, true);
					documentObject.removeEventListener('click', onClick, true);
				};
			} else if (process.env.NODE_ENV === 'test') {
				let onMouseUp = (e: any) => {
					if (state.ignoreEmulatedMouseEvents) {
						state.ignoreEmulatedMouseEvents = false;
					} else if (state.isPointerDown && isValidEvent(e, ref)) {
						triggerInteractOutside(e);
					}
					state.isPointerDown = false;
				};

				let onTouchEnd = (e: any) => {
					state.ignoreEmulatedMouseEvents = true;
					if (state.isPointerDown && isValidEvent(e, ref)) {
						triggerInteractOutside(e);
					}
					state.isPointerDown = false;
				};

				documentObject.addEventListener('mousedown', onPointerDown, true);
				documentObject.addEventListener('mouseup', onMouseUp, true);
				documentObject.addEventListener('touchstart', onPointerDown, true);
				documentObject.addEventListener('touchend', onTouchEnd, true);

				return () => {
					documentObject.removeEventListener('mousedown', onPointerDown, true);
					documentObject.removeEventListener('mouseup', onMouseUp, true);
					documentObject.removeEventListener('touchstart', onPointerDown, true);
					documentObject.removeEventListener('touchend', onTouchEnd, true);
				};
			}
		},
		[ref, isDisabled],
		subSlot(slot, 'listen'),
	);
}

function isValidEvent(event: any, ref: RefObject<Element | null>): boolean {
	if (event.button > 0) {
		return false;
	}
	let target = getEventTarget(event) as Element;
	if (target) {
		// if the event target is no longer in the document, ignore
		const ownerDocument = target.ownerDocument;
		if (!ownerDocument || !nodeContains(ownerDocument.documentElement, target)) {
			return false;
		}
		// If the target is within a top layer element (e.g. toasts), ignore.
		if (target.closest('[data-react-aria-top-layer]')) {
			return false;
		}
	}

	if (!ref.current) {
		return false;
	}

	// When the event source is inside a Shadow DOM, event.target is just the shadow root.
	// Using event.composedPath instead means we can get the actual element inside the shadow root.
	// This only works if the shadow root is open, there is no way to detect if it is closed.
	// If the event composed path contains the ref, interaction is inside.
	return !event.composedPath().includes(ref.current);
}
