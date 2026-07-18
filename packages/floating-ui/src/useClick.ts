// Ported from @floating-ui/react useClick. octane events are NATIVE, so the React
// `event.nativeEvent` accesses become `event`.
import { isHTMLElement } from '@floating-ui/utils/dom';
import { useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';
import { isMouseLikePointerType, isTypeableElement } from './utils';
import type { ElementProps, FloatingRootContext } from './types';

export interface UseClickProps {
	/**
	 * Whether the Hook is enabled, including all internal Effects and event
	 * handlers.
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * The type of event to use to determine a “click” with mouse input.
	 * Keyboard clicks work as normal.
	 * @default 'click'
	 */
	event?: 'click' | 'mousedown';
	/**
	 * Whether to toggle the open state with repeated clicks.
	 * @default true
	 */
	toggle?: boolean;
	/**
	 * Whether to ignore the logic for mouse input (for example, if `useHover()`
	 * is also being used).
	 * @default false
	 */
	ignoreMouse?: boolean;
	/**
	 * Whether to add keyboard handlers (Enter and Space key functionality) for
	 * non-button elements (to open/close the floating element via keyboard
	 * “click”).
	 * @default true
	 */
	keyboardHandlers?: boolean;
	/**
	 * If already open from another event such as the `useHover()` Hook,
	 * determines whether to keep the floating element open when clicking the
	 * reference element for the first time.
	 * @default true
	 */
	stickIfOpen?: boolean;
}

function isButtonTarget(event: Event): boolean {
	return isHTMLElement(event.target) && event.target.tagName === 'BUTTON';
}
function isAnchorTarget(event: Event): boolean {
	return isHTMLElement(event.target) && event.target.tagName === 'A';
}
function isSpaceIgnored(element: Element | null): boolean {
	return isTypeableElement(element);
}

/**
 * Opens or closes the floating element when clicking the reference element.
 * @see https://floating-ui.com/docs/useClick
 */
export function useClick(
	context: FloatingRootContext,
	props?: UseClickProps,
	slot?: symbol,
): ElementProps;
export function useClick(...args: any[]): ElementProps {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const props = (user[1] as UseClickProps) ?? {};

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

	const pointerTypeRef = useRef<string | undefined>(undefined, subSlot(slot, 'ptype'));
	const didKeyDownRef = useRef(false, subSlot(slot, 'kd'));

	const reference = useMemo(
		() => ({
			onPointerDown(event: PointerEvent) {
				pointerTypeRef.current = event.pointerType;
			},
			onMouseDown(event: MouseEvent) {
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
			onClick(event: MouseEvent) {
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
			onKeyDown(event: KeyboardEvent) {
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
			onKeyUp(event: KeyboardEvent) {
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

	return useMemo<ElementProps>(
		() => (enabled ? { reference } : {}),
		[enabled, reference],
		subSlot(slot, 'm:ret'),
	);
}
