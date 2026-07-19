// Ported from @floating-ui/react useFocus. octane events are NATIVE, so
// `event.nativeEvent` → `event`, and `getTarget(event)` reads the native target.
import { getWindow, isElement, isHTMLElement } from '@floating-ui/utils/dom';
import { useEffect, useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';
import {
	activeElement,
	clearTimeoutIfSet,
	contains,
	createAttribute,
	getDocument,
	getTarget,
	isMacSafari,
	isTypeableElement,
	matchesFocusVisible,
} from './utils';
import type { ElementProps, FloatingRootContext, OpenChangeReason } from './types';

export interface UseFocusProps {
	/**
	 * Whether the Hook is enabled, including all internal Effects and event
	 * handlers.
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * Whether the open state only changes if the focus event is considered
	 * visible (`:focus-visible` CSS selector).
	 * @default true
	 */
	visibleOnly?: boolean;
}

/**
 * Opens the floating element while the reference element has focus, like CSS
 * `:focus`.
 * @see https://floating-ui.com/docs/useFocus
 */
export function useFocus(
	context: FloatingRootContext,
	props?: UseFocusProps,
	slot?: symbol,
): ElementProps;
export function useFocus(...args: any[]): ElementProps {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const props = (user[1] as UseFocusProps) ?? {};

	const open = context.open;
	const onOpenChange = context.onOpenChange;
	const events = context.events;
	const dataRef = context.dataRef;
	const elements = context.elements;

	const enabled = props.enabled ?? true;
	const visibleOnly = props.visibleOnly ?? true;

	const blockFocusRef = useRef(false, subSlot(slot, 'block'));
	const timeoutRef = useRef(-1, subSlot(slot, 'timeout'));
	const keyboardModalityRef = useRef(true, subSlot(slot, 'kbd'));

	useEffect(
		() => {
			if (!enabled) return;
			const win = getWindow(elements.domReference);
			function onBlur() {
				if (
					!open &&
					isHTMLElement(elements.domReference) &&
					elements.domReference === activeElement(getDocument(elements.domReference))
				) {
					blockFocusRef.current = true;
				}
			}
			function onKeyDown() {
				keyboardModalityRef.current = true;
			}
			function onPointerDown() {
				keyboardModalityRef.current = false;
			}
			win.addEventListener('blur', onBlur);
			if (isMacSafari()) {
				win.addEventListener('keydown', onKeyDown, true);
				win.addEventListener('pointerdown', onPointerDown, true);
			}
			return () => {
				win.removeEventListener('blur', onBlur);
				if (isMacSafari()) {
					win.removeEventListener('keydown', onKeyDown, true);
					win.removeEventListener('pointerdown', onPointerDown, true);
				}
			};
		},
		[elements.domReference, open, enabled],
		subSlot(slot, 'e:win'),
	);

	useEffect(
		() => {
			if (!enabled) return;
			function onOpenChangeLocal(_ref: { reason?: OpenChangeReason }) {
				const { reason } = _ref;
				if (reason === 'reference-press' || reason === 'escape-key') {
					blockFocusRef.current = true;
				}
			}
			events.on('openchange', onOpenChangeLocal);
			return () => {
				events.off('openchange', onOpenChangeLocal);
			};
		},
		[events, enabled],
		subSlot(slot, 'e:oc'),
	);

	useEffect(
		() => {
			return () => {
				clearTimeoutIfSet(timeoutRef);
			};
		},
		[],
		subSlot(slot, 'e:cleanup'),
	);

	const reference = useMemo(
		() => ({
			onMouseLeave() {
				blockFocusRef.current = false;
			},
			onFocus(event: FocusEvent) {
				if (blockFocusRef.current) return;
				const target = getTarget(event);
				if (visibleOnly && isElement(target)) {
					if (isMacSafari() && !event.relatedTarget) {
						if (!keyboardModalityRef.current && !isTypeableElement(target)) {
							return;
						}
					} else if (!matchesFocusVisible(target)) {
						return;
					}
				}
				onOpenChange(true, event, 'focus');
			},
			onBlur(event: FocusEvent) {
				blockFocusRef.current = false;
				const relatedTarget = event.relatedTarget;

				const movedToFocusGuard =
					isElement(relatedTarget) &&
					relatedTarget.hasAttribute(createAttribute('focus-guard')) &&
					relatedTarget.getAttribute('data-type') === 'outside';

				timeoutRef.current = window.setTimeout(() => {
					const activeEl = activeElement(
						elements.domReference ? elements.domReference.ownerDocument : document,
					);
					if (!relatedTarget && activeEl === elements.domReference) return;
					if (
						contains(dataRef.current.floatingContext?.refs.floating.current, activeEl as any) ||
						contains(elements.domReference, activeEl as any) ||
						movedToFocusGuard
					) {
						return;
					}
					onOpenChange(false, event, 'focus');
				});
			},
		}),
		[dataRef, elements.domReference, onOpenChange, visibleOnly],
		subSlot(slot, 'm:ref'),
	);

	return useMemo<ElementProps>(
		() => (enabled ? { reference } : {}),
		[enabled, reference],
		subSlot(slot, 'm:ret'),
	);
}
