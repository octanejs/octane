// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useFocus.ts (v1.6.0). Opens the
// popup while its trigger has focus, like CSS `:focus` — with the blocked-focus bookkeeping that
// stops a press/Escape dismissal from immediately re-opening when focus returns to the trigger.
//
// octane adaptations: handlers receive the NATIVE event, so `event.nativeEvent` collapses to
// `event`; every composed hook threads an explicit slot.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { addEventListener } from '../addEventListener';
import { mergeCleanups } from '../mergeCleanups';
import { ownerDocument, ownerWindow } from '../owner';
import { platform } from '../platform';
import { useTimeout } from '../useTimeout';
import { isElement, isHTMLElement } from '../dom';
import { matchesFocusVisible } from '../matchesFocusVisible';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';
import { createAttribute } from './createAttribute';
import {
	activeElement,
	contains,
	getTarget,
	isTargetInsideEnabledTrigger,
	isTypeableElement,
} from './element';

const isMacSafari = platform.os.mac && platform.engine.webkit;

export interface UseFocusProps {
	/**
	 * Whether the hook is enabled, including all internal effects and event handlers.
	 * @default true
	 */
	enabled?: boolean | undefined;
	/**
	 * Waits for the specified time before opening.
	 * @default undefined
	 */
	delay?: number | (() => number | undefined) | undefined;
}

export function useFocus(...args: any[]): Record<string, any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocus');
	const context = user[0] as any;
	const props = (user[1] as UseFocusProps) ?? {};

	const { enabled = true, delay } = props;

	const store = context != null && 'rootStore' in context ? context.rootStore : context;

	const { events, dataRef } = store.context;

	const blockFocusRef = useRef(false, subSlot(slot, 'block'));
	// Track which reference should be blocked from re-opening after Escape/press dismissal.
	const blockedReferenceRef = useRef<Element | null>(null, subSlot(slot, 'blockedRef'));
	const keyboardModalityRef = useRef(true, subSlot(slot, 'kbd'));

	const timeout = useTimeout(subSlot(slot, 'to'));

	useEffect(
		() => {
			const domReference = store.select('domReferenceElement');

			if (!enabled) {
				return undefined;
			}

			const win = ownerWindow(domReference);

			// If the reference was focused and the user left the tab/window while the popup was
			// closed, block the focus-open when they return.
			function onBlur() {
				const currentDomReference = store.select('domReferenceElement');
				if (
					!store.select('open') &&
					isHTMLElement(currentDomReference) &&
					currentDomReference === activeElement(ownerDocument(currentDomReference))
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

			return mergeCleanups(
				addEventListener(win, 'blur', onBlur),
				isMacSafari && addEventListener(win, 'keydown', onKeyDown, true),
				isMacSafari && addEventListener(win, 'pointerdown', onPointerDown, true),
			);
		},
		[store, enabled],
		subSlot(slot, 'e:win'),
	);

	useEffect(
		() => {
			if (!enabled) {
				return undefined;
			}

			function onOpenChangeLocal(details: any) {
				if (details.reason === REASONS.triggerPress || details.reason === REASONS.escapeKey) {
					const referenceElement = store.select('domReferenceElement');
					if (isElement(referenceElement)) {
						blockedReferenceRef.current = referenceElement;
						blockFocusRef.current = true;
					}
				}
			}

			events.on('openchange', onOpenChangeLocal);
			return () => {
				events.off('openchange', onOpenChangeLocal);
			};
		},
		[events, enabled, store],
		subSlot(slot, 'e:openchange'),
	);

	const reference = useMemo(
		() => {
			function resetBlockedFocus() {
				blockFocusRef.current = false;
				blockedReferenceRef.current = null;
			}

			return {
				onMouseLeave() {
					resetBlockedFocus();
				},
				onFocus(event: FocusEvent) {
					const focusTarget = event.currentTarget as Element;

					if (blockFocusRef.current) {
						if (blockedReferenceRef.current === focusTarget) {
							return;
						}
						resetBlockedFocus();
					}

					const target = getTarget(event);

					if (isElement(target)) {
						// Safari fails to match `:focus-visible` if focus was initially outside the
						// document.
						if (isMacSafari && !event.relatedTarget) {
							if (!keyboardModalityRef.current && !isTypeableElement(target)) {
								return;
							}
						} else if (!matchesFocusVisible(target as Element)) {
							return;
						}
					}

					const movedFromOtherEnabledTrigger = isTargetInsideEnabledTrigger(
						event.relatedTarget,
						store.context.triggerElements,
					);

					const currentTarget = event.currentTarget;
					const delayValue = typeof delay === 'function' ? delay() : delay;

					if (
						(store.select('open') && movedFromOtherEnabledTrigger) ||
						delayValue === 0 ||
						delayValue === undefined
					) {
						store.setOpen(
							true,
							createChangeEventDetails(REASONS.triggerFocus, event, currentTarget as HTMLElement),
						);
						return;
					}

					timeout.start(delayValue, () => {
						if (blockFocusRef.current) {
							return;
						}
						store.setOpen(
							true,
							createChangeEventDetails(REASONS.triggerFocus, event, currentTarget as HTMLElement),
						);
					});
				},
				onBlur(event: FocusEvent) {
					resetBlockedFocus();

					const relatedTarget = event.relatedTarget;

					// Hit the non-modal focus management portal guard. Focus will be moved into the
					// floating element immediately after.
					const movedToFocusGuard =
						isElement(relatedTarget) &&
						(relatedTarget as Element).hasAttribute(createAttribute('focus-guard')) &&
						(relatedTarget as Element).getAttribute('data-type') === 'outside';

					// Wait for the window blur listener to fire.
					timeout.start(0, () => {
						const domReference = store.select('domReferenceElement');
						const activeEl = activeElement(ownerDocument(domReference));

						// Focus left the page — keep it open.
						if (!relatedTarget && activeEl === domReference) {
							return;
						}

						// When focusing the reference element (e.g. a regular click), then clicking into
						// the floating element, prevent it from hiding. `relatedTarget` only points to
						// the shadow host, so the active element is the reliable check.
						if (
							contains(dataRef.current.floatingContext?.refs.floating.current, activeEl) ||
							contains(domReference, activeEl) ||
							movedToFocusGuard
						) {
							return;
						}

						// If the next focused element is one of the triggers, do not close: that
						// trigger's own focus handler owns the open state.
						const nextFocusedElement = relatedTarget ?? activeEl;
						if (isTargetInsideEnabledTrigger(nextFocusedElement, store.context.triggerElements)) {
							return;
						}

						store.setOpen(false, createChangeEventDetails(REASONS.triggerFocus, event));
					});
				},
			};
		},
		[dataRef, delay, store, timeout],
		subSlot(slot, 'ref'),
	);

	return useMemo(
		() => (enabled ? { reference, trigger: reference } : {}),
		[enabled, reference],
		subSlot(slot, 'out'),
	);
}
