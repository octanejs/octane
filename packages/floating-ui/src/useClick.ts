// Ported from @floating-ui/react useClick. octane events are NATIVE, so the React
// `event.nativeEvent` accesses become `event`.
import { isHTMLElement } from '@floating-ui/utils/dom';
import { useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';
import { isMouseLikePointerType, isTypeableElement } from './utils';

function isButtonTarget(event: any): boolean {
	return isHTMLElement(event.target) && event.target.tagName === 'BUTTON';
}
function isAnchorTarget(event: any): boolean {
	return isHTMLElement(event.target) && event.target.tagName === 'A';
}
function isSpaceIgnored(element: any): boolean {
	return isTypeableElement(element);
}

export function useClick(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const context = user[0];
	const props = (user[1] as any) ?? {};

	const open = context.open;
	const onOpenChange = context.onOpenChange;
	const dataRef = context.dataRef;
	const domReference = context.elements.domReference;

	const enabled = props.enabled ?? true;
	const eventOption = props.event ?? 'click';
	const toggle = props.toggle ?? true;
	const ignoreMouse = props.ignoreMouse ?? false;
	const keyboardHandlers = props.keyboardHandlers ?? true;
	const stickIfOpen = props.stickIfOpen ?? true;

	const pointerTypeRef = useRef<any>(undefined, subSlot(slot, 'ptype'));
	const didKeyDownRef = useRef(false, subSlot(slot, 'kd'));

	const reference = useMemo(
		() => ({
			onPointerDown(event: any) {
				pointerTypeRef.current = event.pointerType;
			},
			onMouseDown(event: any) {
				const pointerType = pointerTypeRef.current;
				if (event.button !== 0) return;
				if (eventOption === 'click') return;
				if (isMouseLikePointerType(pointerType, true) && ignoreMouse) return;
				if (
					open &&
					toggle &&
					(dataRef.current.openEvent && stickIfOpen
						? dataRef.current.openEvent.type === 'mousedown'
						: true)
				) {
					onOpenChange(false, event, 'click');
				} else {
					event.preventDefault();
					onOpenChange(true, event, 'click');
				}
			},
			onClick(event: any) {
				const pointerType = pointerTypeRef.current;
				if (eventOption === 'mousedown' && pointerTypeRef.current) {
					pointerTypeRef.current = undefined;
					return;
				}
				if (isMouseLikePointerType(pointerType, true) && ignoreMouse) return;
				if (
					open &&
					toggle &&
					(dataRef.current.openEvent && stickIfOpen
						? dataRef.current.openEvent.type === 'click'
						: true)
				) {
					onOpenChange(false, event, 'click');
				} else {
					onOpenChange(true, event, 'click');
				}
			},
			onKeyDown(event: any) {
				pointerTypeRef.current = undefined;
				if (event.defaultPrevented || !keyboardHandlers || isButtonTarget(event)) {
					return;
				}
				if (event.key === ' ' && !isSpaceIgnored(domReference)) {
					event.preventDefault();
					didKeyDownRef.current = true;
				}
				if (isAnchorTarget(event)) {
					return;
				}
				if (event.key === 'Enter') {
					if (open && toggle) {
						onOpenChange(false, event, 'click');
					} else {
						onOpenChange(true, event, 'click');
					}
				}
			},
			onKeyUp(event: any) {
				if (
					event.defaultPrevented ||
					!keyboardHandlers ||
					isButtonTarget(event) ||
					isSpaceIgnored(domReference)
				) {
					return;
				}
				if (event.key === ' ' && didKeyDownRef.current) {
					didKeyDownRef.current = false;
					if (open && toggle) {
						onOpenChange(false, event, 'click');
					} else {
						onOpenChange(true, event, 'click');
					}
				}
			},
		}),
		[
			dataRef,
			domReference,
			eventOption,
			ignoreMouse,
			keyboardHandlers,
			onOpenChange,
			open,
			stickIfOpen,
			toggle,
		],
		subSlot(slot, 'm:ref'),
	);

	return useMemo(
		() => (enabled ? { reference } : {}),
		[enabled, reference],
		subSlot(slot, 'm:ret'),
	);
}
