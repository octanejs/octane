// Ported from .base-ui/packages/react/src/utils/useMixedToggleClickHandler.ts (v1.6.0),
// octane-adapted (slot-threaded; native events). Returns `click`/`mousedown` handlers for a trigger
// whose popup is toggled by two different events — opened on mousedown, closed on click — so the
// click that follows the opening mousedown does not immediately close the popup again.
//
// octane adaptations: events are NATIVE (not synthetic), so the handlers take the native event
// and `preventBaseUIHandler` is the shim `mergeProps`/`makeEventPreventable` attaches to it.
// Upstream's empty `UseMixedToggleClickHandlerState` interface is a docs-pipeline artifact with no
// members, so it is dropped.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { EMPTY_OBJECT } from './empty';
import { ownerDocument } from './owner';

export interface UseMixedToggleClickHandlerParameters {
	/**
	 * Whether the mixed toggle click handler is enabled.
	 * @default true
	 */
	enabled?: boolean | undefined;
	/**
	 * Determines what action is performed on mousedown.
	 */
	mouseDownAction: 'open' | 'close';
	/**
	 * The current open state of the popup.
	 */
	open: boolean;
}

export interface UseMixedToggleClickHandlerReturnValue {
	onMouseDown?: (event: any) => void;
	onClick?: (event: any) => void;
}

export function useMixedToggleClickHandler(...args: any[]): UseMixedToggleClickHandlerReturnValue {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMixedToggleClickHandler');
	const { enabled = true, mouseDownAction, open } = user[0] as UseMixedToggleClickHandlerParameters;

	const ignoreClickRef = useRef(false, subSlot(slot, 'ignore'));

	return useMemo(
		() => {
			if (!enabled) {
				return EMPTY_OBJECT;
			}

			return {
				onMouseDown: (event: any) => {
					if ((mouseDownAction === 'open' && !open) || (mouseDownAction === 'close' && open)) {
						ignoreClickRef.current = true;

						ownerDocument(event.currentTarget as Element).addEventListener(
							'click',
							() => {
								ignoreClickRef.current = false;
							},
							{ once: true },
						);
					}
				},
				onClick: (event: any) => {
					if (ignoreClickRef.current) {
						ignoreClickRef.current = false;
						event.preventBaseUIHandler();
					}
				},
			};
		},
		[enabled, mouseDownAction, open],
		subSlot(slot, 'm'),
	);
}
