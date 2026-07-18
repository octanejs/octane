// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/useCloseOnScroll.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the explicit dependency array is kept verbatim.
//
// NOTE: ported ahead of the rest of the overlays area because useOverlayTrigger (needed by
// useMenuTrigger) shares its `onCloseMap` backward-compatibility channel.
import { getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import type { RefObject } from '@react-types/shared';
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

// This behavior moved from useOverlayTrigger to useOverlayPosition.
// For backward compatibility, where useOverlayTrigger handled hiding the popover on close,
// it sets a close function here mapped from the trigger element. This way we can avoid
// forcing users to pass an onClose function to useOverlayPosition which could be considered
// a breaking change.
export const onCloseMap: WeakMap<Element, () => void> = new WeakMap();

interface CloseOnScrollOptions {
	triggerRef: RefObject<Element | null>;
	isOpen?: boolean;
	onClose?: (() => void) | null;
}

/** @private */
export function useCloseOnScroll(opts: CloseOnScrollOptions): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCloseOnScroll(opts: CloseOnScrollOptions, slot: symbol | undefined): void;
export function useCloseOnScroll(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCloseOnScroll');
	const opts = user[0] as CloseOnScrollOptions;

	let { triggerRef, isOpen, onClose } = opts;

	useEffect(
		() => {
			if (!isOpen || onClose === null) {
				return;
			}

			let onScroll = (e: Event) => {
				// Ignore if scrolling an scrollable region outside the trigger's tree.
				let target = getEventTarget(e);
				// window is not a Node and doesn't have contain, but window contains everything
				if (
					!triggerRef.current ||
					(target instanceof Node && !nodeContains(target, triggerRef.current))
				) {
					return;
				}

				// Ignore scroll events on any input or textarea as the cursor position can cause it to scroll
				// such as in a combobox. Clicking the dropdown button places focus on the input, and if the
				// text inside the input extends beyond the 'end', then it will scroll so the cursor is visible at the end.
				if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
					return;
				}

				let onCloseHandler = onClose || onCloseMap.get(triggerRef.current);
				if (onCloseHandler) {
					onCloseHandler();
				}
			};

			window.addEventListener('scroll', onScroll, true);
			return () => {
				window.removeEventListener('scroll', onScroll, true);
			};
		},
		[isOpen, onClose, triggerRef],
		subSlot(slot, 'scroll'),
	);
}
