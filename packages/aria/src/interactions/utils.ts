// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/utils.ts).
// octane adaptation: handlers receive NATIVE events (there is no synthetic layer), so the
// "synthetic event" here is the native event augmented in place — `createSyntheticEvent`
// stays for the paths that dispatch/wrap events themselves, and its self-referential
// `nativeEvent` keeps downstream `.nativeEvent` reads working for both arrival paths.
import type { FocusableElement } from '@react-types/shared';
import { useCallback, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { focusWithoutScrolling } from '../utils/focusWithoutScrolling';
import { getActiveElement, getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getOwnerWindow } from '../utils/domHelpers';
import { isFocusable } from '../utils/isFocusable';
import { useLayoutEffect } from '../utils/useLayoutEffect';

// The augmented-native-event surface react-aria's internals read. On octane the native
// event IS the event object; these fields are stamped onto it.
export type SyntheticEventShim<E extends Event = Event> = E & {
	nativeEvent: E;
	isDefaultPrevented(): boolean;
	isPropagationStopped(): boolean;
	persist(): void;
};

// Turn a native event into the augmented shape above (upstream: "into a React synthetic
// event"). Mutates the per-dispatch event object, exactly like upstream.
export function createSyntheticEvent<E extends Event>(nativeEvent: E): SyntheticEventShim<E> {
	let event = nativeEvent as SyntheticEventShim<E>;
	event.nativeEvent = nativeEvent;
	event.isDefaultPrevented = () => event.defaultPrevented;
	// cancelBubble is technically deprecated in the spec, but still supported in all browsers.
	event.isPropagationStopped = () => (event as any).cancelBubble;
	event.persist = () => {};
	return event;
}

export function setEventTarget(event: Event, target: Element): void {
	Object.defineProperty(event, 'target', { value: target });
	Object.defineProperty(event, 'currentTarget', { value: target });
}

export function useSyntheticBlurEvent(onBlur: (e: FocusEvent) => void): (e: FocusEvent) => void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSyntheticBlurEvent(
	onBlur: (e: FocusEvent) => void,
	slot: symbol | undefined,
): (e: FocusEvent) => void;
export function useSyntheticBlurEvent(...args: any[]): (e: FocusEvent) => void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSyntheticBlurEvent');
	const onBlur = user[0] as (e: FocusEvent) => void;

	let stateRef = useRef(
		{
			isFocused: false,
			observer: null as MutationObserver | null,
		},
		subSlot(slot, 'state'),
	);

	// Clean up MutationObserver on unmount. See below.

	useLayoutEffect(
		() => {
			const state = stateRef.current;
			return () => {
				if (state.observer) {
					state.observer.disconnect();
					state.observer = null;
				}
			};
		},
		[],
		subSlot(slot, 'teardown'),
	);

	// This function is called during a focus event.
	return useCallback(
		(e: FocusEvent) => {
			// Browsers do not fire blur when a focused element becomes disabled. Most fire a
			// native focusout event in this case, except for Firefox. In that case, we use a
			// MutationObserver to watch for the disabled attribute, and dispatch these events
			// ourselves. For browsers that do, focusout fires before the MutationObserver, so
			// onBlur should not fire twice.
			let eventTarget = getEventTarget(e);
			if (
				eventTarget instanceof HTMLButtonElement ||
				eventTarget instanceof HTMLInputElement ||
				eventTarget instanceof HTMLTextAreaElement ||
				eventTarget instanceof HTMLSelectElement
			) {
				stateRef.current.isFocused = true;

				let target = eventTarget;
				let onBlurHandler: ((e: FocusEvent) => void) | null = (e: FocusEvent) => {
					stateRef.current.isFocused = false;

					if (target.disabled) {
						// For backward compatibility, dispatch the augmented event shape.
						let event = createSyntheticEvent(e);
						onBlur?.(event);
					}

					// We no longer need the MutationObserver once the target is blurred.
					if (stateRef.current.observer) {
						stateRef.current.observer.disconnect();
						stateRef.current.observer = null;
					}
				};

				target.addEventListener('focusout', onBlurHandler as EventListener, { once: true });

				stateRef.current.observer = new MutationObserver(() => {
					if (stateRef.current.isFocused && target.disabled) {
						stateRef.current.observer?.disconnect();
						let relatedTargetEl = target === getActiveElement() ? null : getActiveElement();
						target.dispatchEvent(new FocusEvent('blur', { relatedTarget: relatedTargetEl }));
						target.dispatchEvent(
							new FocusEvent('focusout', { bubbles: true, relatedTarget: relatedTargetEl }),
						);
					}
				});

				stateRef.current.observer.observe(target, {
					attributes: true,
					attributeFilter: ['disabled'],
				});
			}
		},
		[onBlur],
		subSlot(slot, 'handler'),
	);
}

export let ignoreFocusEvent = false;

/**
 * This function prevents the next focus event fired on `target`, without using
 * `event.preventDefault()`. It works by waiting for the series of focus events to occur, and
 * reverts focus back to where it was before. It also makes these events mostly non-observable by
 * using a capturing listener on the window and stopping propagation.
 */
export function preventFocus(target: FocusableElement | null): (() => void) | undefined {
	// The browser will focus the nearest focusable ancestor of our target.
	while (target && !isFocusable(target, { skipVisibilityCheck: true })) {
		target = target.parentElement as FocusableElement | null;
	}

	let window = getOwnerWindow(target);
	let activeElement = window.document.activeElement as FocusableElement | null;
	if (!activeElement || activeElement === target) {
		return;
	}

	ignoreFocusEvent = true;
	let isRefocusing = false;
	let onBlur = (e: FocusEvent) => {
		if (getEventTarget(e) === activeElement || isRefocusing) {
			e.stopImmediatePropagation();
		}
	};

	let onFocusOut = (e: FocusEvent) => {
		if (getEventTarget(e) === activeElement || isRefocusing) {
			e.stopImmediatePropagation();

			// If there was no focusable ancestor, we don't expect a focus event.
			// Re-focus the original active element here.
			if (!target && !isRefocusing) {
				isRefocusing = true;
				focusWithoutScrolling(activeElement);
				cleanup();
			}
		}
	};

	let onFocus = (e: FocusEvent) => {
		if (getEventTarget(e) === target || isRefocusing) {
			e.stopImmediatePropagation();
		}
	};

	let onFocusIn = (e: FocusEvent) => {
		if (getEventTarget(e) === target || isRefocusing) {
			e.stopImmediatePropagation();

			if (!isRefocusing) {
				isRefocusing = true;
				focusWithoutScrolling(activeElement);
				cleanup();
			}
		}
	};

	window.addEventListener('blur', onBlur, true);
	window.addEventListener('focusout', onFocusOut, true);
	window.addEventListener('focusin', onFocusIn, true);
	window.addEventListener('focus', onFocus, true);

	let cleanup = () => {
		cancelAnimationFrame(raf);
		window.removeEventListener('blur', onBlur, true);
		window.removeEventListener('focusout', onFocusOut, true);
		window.removeEventListener('focusin', onFocusIn, true);
		window.removeEventListener('focus', onFocus, true);
		ignoreFocusEvent = false;
		isRefocusing = false;
	};

	let raf = requestAnimationFrame(cleanup);
	return cleanup;
}
