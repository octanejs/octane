// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useScrollWheel.ts).
// octane adaptations:
// - The wheel handler receives the native WheelEvent (upstream's untyped param).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type { RefObject, ScrollEvents } from '@react-types/shared';
import { useCallback } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useEvent } from '../utils/useEvent';

export interface ScrollWheelProps extends ScrollEvents {
	/** Whether the scroll listener should be disabled. */
	isDisabled?: boolean;
}

// scroll wheel needs to be added not passively so it's cancelable, small helper hook to remember that
// (that means bypassing framework-delegated wheel handling with a direct element listener —
// which useEvent is. Element-target wheel listeners are cancelable by default; the browser's
// passive-by-default intervention only covers window/document/body. Upstream likewise passes
// no explicit `passive: false` — see the pinned source.)
export function useScrollWheel(props: ScrollWheelProps, ref: RefObject<HTMLElement | null>): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useScrollWheel(
	props: ScrollWheelProps,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): void;
export function useScrollWheel(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useScrollWheel');
	const props = user[0] as ScrollWheelProps;
	const ref = user[1] as RefObject<HTMLElement | null>;

	let { onScroll, isDisabled } = props;
	let onScrollHandler = useCallback(
		(e: WheelEvent) => {
			// If the ctrlKey is pressed, this is a zoom event, do nothing.
			if (e.ctrlKey) {
				return;
			}

			// stop scrolling the page
			e.preventDefault();
			e.stopPropagation();

			if (onScroll) {
				onScroll({ deltaX: e.deltaX, deltaY: e.deltaY });
			}
		},
		[onScroll],
		subSlot(slot, 'handler'),
	);

	useEvent(ref, 'wheel', isDisabled ? undefined : onScrollHandler, subSlot(slot, 'wheel'));
}
