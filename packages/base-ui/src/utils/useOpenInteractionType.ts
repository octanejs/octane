// Ported from .base-ui/packages/react/src/utils/useOpenInteractionType.ts (v1.6.0), octane-adapted
// (slot-threaded; native events). Records the interaction type (mouse/touch/pen/keyboard) that
// opened a popup, so trigger-owned focus can behave correctly.
import { useMemo } from 'octane';

import { subSlot } from '../internal';
import { useStableCallback } from './useStableCallback';
import { useEnhancedClickHandler, type InteractionType } from './useEnhancedClickHandler';
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
