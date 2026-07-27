// Ported from .base-ui/packages/react/src/utils/useOpenInteractionType.ts (v1.6.0), octane-adapted
// (slot-threaded; native events). Records the interaction type (mouse/touch/pen/keyboard) that
// opened a popup, so trigger-owned focus can behave correctly.
import { useMemo, useState } from 'octane';

import { subSlot } from '../internal';
import { useStableCallback } from './useStableCallback';
import { useEnhancedClickHandler, type InteractionType } from './useEnhancedClickHandler';
import { useValueChanged } from './useValueChanged';
import { platform } from './platform';

export function useOpenMethodTriggerProps(
	open: boolean | (() => boolean),
	setOpenMethod: (interactionType: InteractionType | null) => void,
	slot: symbol | undefined,
): { onClick: (event: any) => void; onPointerDown: (event: any) => void } {
	const handleTriggerClick = useStableCallback(
		(_: any, interactionType: InteractionType) => {
			const isOpen = typeof open === 'function' ? open() : open;
			if (!isOpen) {
				setOpenMethod(interactionType || (platform.os.ios ? 'touch' : ''));
			}
		},
		subSlot(slot, 'h'),
	);

	const { onClick, onPointerDown } = useEnhancedClickHandler(
		handleTriggerClick,
		subSlot(slot, 'ech'),
	);

	return useMemo(() => ({ onClick, onPointerDown }), [onClick, onPointerDown], subSlot(slot, 'm'));
}

/**
 * Determines the interaction type (keyboard, mouse, touch, etc.) that opened the component, and
 * returns it alongside the trigger props that record it. Resets to `null` once the popup closes.
 *
 * Used by roots that own the open method locally (Menu) rather than delegating it to each trigger
 * (Popover, which calls `useOpenMethodTriggerProps` directly and stores the result in its store).
 */
export function useOpenInteractionType(
	open: boolean,
	slot: symbol | undefined,
): {
	openMethod: InteractionType | null;
	triggerProps: { onClick: (event: any) => void; onPointerDown: (event: any) => void };
} {
	const [openMethod, setOpenMethod] = useState<InteractionType | null>(null, subSlot(slot, 's'));

	const triggerProps = useOpenMethodTriggerProps(open, setOpenMethod, subSlot(slot, 'tp'));

	useValueChanged(
		open,
		(previousOpen: boolean) => {
			if (previousOpen && !open) {
				setOpenMethod(null);
			}
		},
		subSlot(slot, 'vc'),
	);

	return useMemo(
		() => ({ openMethod, triggerProps }),
		[openMethod, triggerProps],
		subSlot(slot, 'r'),
	);
}
