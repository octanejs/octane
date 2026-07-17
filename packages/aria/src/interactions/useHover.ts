// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useHover.ts).
// octane adaptations:
// - `hoverProps` are octane NATIVE delegated event props (`onPointerEnter`/`onPointerLeave`
//   receive native events; octane's enter/leave delegation is target-only, matching the
//   platform). `DOMAttributes` from '@react-types/shared' becomes a local structural alias.
// - `e.currentTarget` is EventTarget-typed on native events; casts to Element where
//   upstream relied on React's element-typed currentTarget.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; the
//   explicit useMemo/useEffect dep arrays are preserved exactly.

// Portions of the code in this file are based on code from react.
// Original licensing for the following can be found in the
// NOTICE file in the root directory of this source tree.
// See https://github.com/facebook/react/tree/cc7c1aece46a6b69b41958d731e0fd27c94bfc6c/packages/react-interactions

import type { HoverEvents } from '@react-types/shared';
import { useEffect, useMemo, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import { getOwnerDocument } from '../utils/domHelpers';
import { useGlobalListeners } from '../utils/useGlobalListeners';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React attribute types).
export type DOMAttributes = Record<string, any>;

export interface HoverProps extends HoverEvents {
	/** Whether the hover events should be disabled. */
	isDisabled?: boolean;
}

export interface HoverResult {
	/** Props to spread on the target element. */
	hoverProps: DOMAttributes;
	isHovered: boolean;
}

// iOS fires onPointerEnter twice: once with pointerType="touch" and again with pointerType="mouse".
// We want to ignore these emulated events so they do not trigger hover behavior.
// See https://bugs.webkit.org/show_bug.cgi?id=214609.
let globalIgnoreEmulatedMouseEvents = false;
let hoverCount = 0;

function setGlobalIgnoreEmulatedMouseEvents() {
	globalIgnoreEmulatedMouseEvents = true;

	// Clear globalIgnoreEmulatedMouseEvents after a short timeout. iOS fires onPointerEnter
	// with pointerType="mouse" immediately after onPointerUp and before onFocus. On other
	// devices that don't have this quirk, we don't want to ignore a mouse hover sometime in
	// the distant future because a user previously touched the element.
	setTimeout(() => {
		globalIgnoreEmulatedMouseEvents = false;
	}, 500);
}

function handleGlobalPointerEvent(e: PointerEvent) {
	if (e.pointerType === 'touch') {
		setGlobalIgnoreEmulatedMouseEvents();
	}
}

function setupGlobalTouchEvents(): (() => void) | undefined {
	let ownerDocument = getOwnerDocument(null);
	if (typeof ownerDocument === 'undefined') {
		return;
	}

	if (hoverCount === 0) {
		if (typeof PointerEvent !== 'undefined') {
			ownerDocument.addEventListener('pointerup', handleGlobalPointerEvent);
		} else if (process.env.NODE_ENV === 'test') {
			ownerDocument.addEventListener('touchend', setGlobalIgnoreEmulatedMouseEvents);
		}
	}

	hoverCount++;
	return () => {
		hoverCount--;
		if (hoverCount > 0) {
			return;
		}

		if (typeof PointerEvent !== 'undefined') {
			ownerDocument.removeEventListener('pointerup', handleGlobalPointerEvent);
		} else if (process.env.NODE_ENV === 'test') {
			ownerDocument.removeEventListener('touchend', setGlobalIgnoreEmulatedMouseEvents);
		}
	};
}

/**
 * Handles pointer hover interactions for an element. Normalizes behavior
 * across browsers and platforms, and ignores emulated mouse events on touch devices.
 */
export function useHover(props: HoverProps): HoverResult;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useHover(props: HoverProps, slot: symbol | undefined): HoverResult;
export function useHover(...args: any[]): HoverResult {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useHover');
	const props = user[0] as HoverProps;

	let { onHoverStart, onHoverChange, onHoverEnd, isDisabled } = props;

	let [isHovered, setHovered] = useState(false, subSlot(slot, 'hovered'));
	let state = useRef(
		{
			isHovered: false,
			ignoreEmulatedMouseEvents: false,
			pointerType: '',
			target: null as HTMLElement | null,
		},
		subSlot(slot, 'state'),
	).current;

	useEffect(setupGlobalTouchEvents, [], subSlot(slot, 'globalTouch'));
	let { addGlobalListener, removeAllGlobalListeners } = useGlobalListeners(subSlot(slot, 'global'));

	let { hoverProps, triggerHoverEnd } = useMemo(
		() => {
			let triggerHoverStart = (event: any, pointerType: any) => {
				state.pointerType = pointerType;
				if (
					isDisabled ||
					pointerType === 'touch' ||
					state.isHovered ||
					!nodeContains(event.currentTarget as Element, getEventTarget(event) as Element)
				) {
					return;
				}

				state.isHovered = true;
				let target = event.currentTarget;
				state.target = target;

				// When an element that is hovered over is removed, no pointerleave event is fired by the browser,
				// even though the originally hovered target may have shrunk in size so it is no longer hovered.
				// However, a pointerover event will be fired on the new target the mouse is over.
				// In Chrome this happens immediately. In Safari and Firefox, it happens upon moving the mouse one pixel.
				addGlobalListener(
					getOwnerDocument(getEventTarget(event) as Element),
					'pointerover',
					(e: PointerEvent) => {
						if (
							state.isHovered &&
							state.target &&
							!nodeContains(state.target, getEventTarget(e) as Element)
						) {
							triggerHoverEnd(e, e.pointerType);
						}
					},
					{ capture: true },
				);

				if (onHoverStart) {
					onHoverStart({
						type: 'hoverstart',
						target,
						pointerType,
					});
				}

				if (onHoverChange) {
					onHoverChange(true);
				}

				setHovered(true);
			};

			let triggerHoverEnd = (event: any, pointerType: any) => {
				let target = state.target;
				state.pointerType = '';
				state.target = null;

				if (pointerType === 'touch' || !state.isHovered || !target) {
					return;
				}

				state.isHovered = false;
				removeAllGlobalListeners();

				if (onHoverEnd) {
					onHoverEnd({
						type: 'hoverend',
						target,
						pointerType,
					});
				}

				if (onHoverChange) {
					onHoverChange(false);
				}

				setHovered(false);
			};

			let hoverProps: DOMAttributes = {};

			if (typeof PointerEvent !== 'undefined') {
				hoverProps.onPointerEnter = (e: PointerEvent) => {
					if (globalIgnoreEmulatedMouseEvents && e.pointerType === 'mouse') {
						return;
					}

					triggerHoverStart(e, e.pointerType);
				};

				hoverProps.onPointerLeave = (e: PointerEvent) => {
					if (
						!isDisabled &&
						nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)
					) {
						triggerHoverEnd(e, e.pointerType);
					}
				};
			} else if (process.env.NODE_ENV === 'test') {
				hoverProps.onTouchStart = () => {
					state.ignoreEmulatedMouseEvents = true;
				};

				hoverProps.onMouseEnter = (e: MouseEvent) => {
					if (!state.ignoreEmulatedMouseEvents && !globalIgnoreEmulatedMouseEvents) {
						triggerHoverStart(e, 'mouse');
					}

					state.ignoreEmulatedMouseEvents = false;
				};

				hoverProps.onMouseLeave = (e: MouseEvent) => {
					if (
						!isDisabled &&
						nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)
					) {
						triggerHoverEnd(e, 'mouse');
					}
				};
			}
			return { hoverProps, triggerHoverEnd };
		},
		[
			onHoverStart,
			onHoverChange,
			onHoverEnd,
			isDisabled,
			state,
			addGlobalListener,
			removeAllGlobalListeners,
		],
		subSlot(slot, 'props'),
	);

	useEffect(
		() => {
			// Call the triggerHoverEnd as soon as isDisabled changes to true
			// Safe to call triggerHoverEnd, it will early return if we aren't currently hovering
			if (isDisabled) {
				triggerHoverEnd({ currentTarget: state.target }, state.pointerType);
			}
		},
		[isDisabled],
		subSlot(slot, 'disabled'),
	);

	return {
		hoverProps,
		isHovered,
	};
}
