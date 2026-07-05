// Ported from @base-ui/utils/useEnhancedClickHandler (v1.6.0), octane-adapted (native events; the
// refs/callbacks thread slots). Detects the pointer type behind a click (Safari/Firefox use
// MouseEvent, not PointerEvent) + keyboard clicks (`event.detail === 0`).
import { useRef, useCallback } from 'octane';

import { subSlot } from '../internal';

export type InteractionType = 'mouse' | 'touch' | 'pen' | 'keyboard' | '';

export function useEnhancedClickHandler(
	handler: (event: any, interactionType: InteractionType) => void,
	slot: symbol | undefined,
): { onClick: (event: any) => void; onPointerDown: (event: any) => void } {
	const lastClickInteractionTypeRef = useRef<InteractionType>('', subSlot(slot, 'last'));

	const handlePointerDown = useCallback(
		(event: any) => {
			if (event.defaultPrevented) {
				return;
			}
			lastClickInteractionTypeRef.current = event.pointerType as InteractionType;
			handler(event, event.pointerType as InteractionType);
		},
		[handler],
		subSlot(slot, 'pd'),
	);

	const handleClick = useCallback(
		(event: any) => {
			// event.detail is the click count; 0 means keyboard-triggered.
			if (event.detail === 0) {
				handler(event, 'keyboard');
				return;
			}
			if ('pointerType' in event) {
				handler(event, event.pointerType);
			} else {
				handler(event, lastClickInteractionTypeRef.current);
			}
			lastClickInteractionTypeRef.current = '';
		},
		[handler],
		subSlot(slot, 'click'),
	);

	return { onClick: handleClick, onPointerDown: handlePointerDown };
}
