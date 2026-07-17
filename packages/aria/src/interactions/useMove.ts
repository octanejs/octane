// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useMove.ts).
// octane adaptations:
// - Handlers receive NATIVE events: React.MouseEvent/React.TouchEvent/React.PointerEvent
//   annotations → native MouseEvent/TouchEvent/PointerEvent; `onKeyDown`'s param carries an
//   explicit native annotation (upstream got it contextually from React's DOMAttributes).
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over React's
//   synthetic handlers).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import { disableTextSelection, restoreTextSelection } from './textSelection';
import type { MoveEvents, PointerType } from '@react-types/shared';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getOwnerWindow } from '../utils/domHelpers';
import { useCallback, useMemo, useRef } from 'octane';
import { S, splitSlot, subSlot } from '../internal';
import { useEffectEvent } from '../utils/useEffectEvent';
import { useGlobalListeners } from '../utils/useGlobalListeners';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler/attribute types).
type DOMAttributes = Record<string, any>;

export interface MoveResult {
	/** Props to spread on the target element. */
	moveProps: DOMAttributes;
}

interface EventBase {
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
}

/**
 * Handles move interactions across mouse, touch, and keyboard, including dragging with
 * the mouse or touch, and using the arrow keys. Normalizes behavior across browsers and
 * platforms, and ignores emulated mouse events on touch devices.
 */
export function useMove(props: MoveEvents, ...args: any[]): MoveResult;
export function useMove(...args: any[]): MoveResult {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMove');
	const props = user[0] as MoveEvents;

	let { onMoveStart, onMove, onMoveEnd } = props;

	let state = useRef<{
		didMove: boolean;
		lastPosition: { pageX: number; pageY: number } | null;
		id: number | null;
	}>({ didMove: false, lastPosition: null, id: null }, subSlot(slot, 'state'));

	let { addGlobalListener, removeGlobalListener } = useGlobalListeners(subSlot(slot, 'listeners'));

	let move = useCallback(
		(originalEvent: EventBase, pointerType: PointerType, deltaX: number, deltaY: number) => {
			if (deltaX === 0 && deltaY === 0) {
				return;
			}

			if (!state.current.didMove) {
				state.current.didMove = true;
				onMoveStart?.({
					type: 'movestart',
					pointerType,
					shiftKey: originalEvent.shiftKey,
					metaKey: originalEvent.metaKey,
					ctrlKey: originalEvent.ctrlKey,
					altKey: originalEvent.altKey,
				});
			}
			onMove?.({
				type: 'move',
				pointerType,
				deltaX: deltaX,
				deltaY: deltaY,
				shiftKey: originalEvent.shiftKey,
				metaKey: originalEvent.metaKey,
				ctrlKey: originalEvent.ctrlKey,
				altKey: originalEvent.altKey,
			});
		},
		[onMoveStart, onMove, state],
		subSlot(slot, 'move'),
	);
	let moveEvent = useEffectEvent(move, subSlot(slot, 'moveEvent'));

	let end = useCallback(
		(originalEvent: EventBase, pointerType: PointerType) => {
			restoreTextSelection();
			if (state.current.didMove) {
				onMoveEnd?.({
					type: 'moveend',
					pointerType,
					shiftKey: originalEvent.shiftKey,
					metaKey: originalEvent.metaKey,
					ctrlKey: originalEvent.ctrlKey,
					altKey: originalEvent.altKey,
				});
			}
		},
		[onMoveEnd, state],
		subSlot(slot, 'end'),
	);
	let endEvent = useEffectEvent(end, subSlot(slot, 'endEvent'));

	let moveProps = useMemo(
		() => {
			let moveProps: DOMAttributes = {};

			let start = () => {
				disableTextSelection();
				state.current.didMove = false;
			};

			if (typeof PointerEvent === 'undefined' && process.env.NODE_ENV === 'test') {
				let onMouseMove = (e: MouseEvent) => {
					if (e.button === 0) {
						// Should be safe to use the useEffectEvent because these are equivalent https://github.com/reactjs/react.dev/issues/8075#issuecomment-3400179389
						// However, the compiler is not smart enough to know that. As such, this whole file must be manually optimised as the compiler will bail.
						moveEvent(
							e,
							'mouse',
							e.pageX - (state.current.lastPosition?.pageX ?? 0),
							e.pageY - (state.current.lastPosition?.pageY ?? 0),
						);
						state.current.lastPosition = { pageX: e.pageX, pageY: e.pageY };
					}
				};
				let onMouseUp = (e: MouseEvent) => {
					if (e.button === 0) {
						endEvent(e, 'mouse');
						let ownerWindow = getOwnerWindow(getEventTarget(e) as Element);
						removeGlobalListener(ownerWindow, 'mousemove', onMouseMove, false);
						removeGlobalListener(ownerWindow, 'mouseup', onMouseUp, false);
					}
				};
				moveProps.onMouseDown = (e: MouseEvent) => {
					if (e.button === 0) {
						start();
						e.stopPropagation();
						e.preventDefault();
						state.current.lastPosition = { pageX: e.pageX, pageY: e.pageY };
						let ownerWindow = getOwnerWindow(getEventTarget(e) as Element);
						addGlobalListener(ownerWindow, 'mousemove', onMouseMove, false);
						addGlobalListener(ownerWindow, 'mouseup', onMouseUp, false);
					}
				};

				let onTouchMove = (e: TouchEvent) => {
					let touch = [...e.changedTouches].findIndex(
						({ identifier }) => identifier === state.current.id,
					);
					if (touch >= 0) {
						let { pageX, pageY } = e.changedTouches[touch];
						moveEvent(
							e,
							'touch',
							pageX - (state.current.lastPosition?.pageX ?? 0),
							pageY - (state.current.lastPosition?.pageY ?? 0),
						);
						state.current.lastPosition = { pageX, pageY };
					}
				};
				let onTouchEnd = (e: TouchEvent) => {
					let touch = [...e.changedTouches].findIndex(
						({ identifier }) => identifier === state.current.id,
					);
					if (touch >= 0) {
						endEvent(e, 'touch');
						state.current.id = null;
						let ownerWindow = getOwnerWindow(getEventTarget(e) as Element);
						removeGlobalListener(ownerWindow, 'touchmove', onTouchMove);
						removeGlobalListener(ownerWindow, 'touchend', onTouchEnd);
						removeGlobalListener(ownerWindow, 'touchcancel', onTouchEnd);
					}
				};
				moveProps.onTouchStart = (e: TouchEvent) => {
					if (e.changedTouches.length === 0 || state.current.id != null) {
						return;
					}

					let { pageX, pageY, identifier } = e.changedTouches[0];
					start();
					e.stopPropagation();
					e.preventDefault();
					state.current.lastPosition = { pageX, pageY };
					state.current.id = identifier;
					let ownerWindow = getOwnerWindow(getEventTarget(e) as Element);
					addGlobalListener(ownerWindow, 'touchmove', onTouchMove, false);
					addGlobalListener(ownerWindow, 'touchend', onTouchEnd, false);
					addGlobalListener(ownerWindow, 'touchcancel', onTouchEnd, false);
				};
			} else {
				let onPointerMove = (e: PointerEvent) => {
					if (e.pointerId === state.current.id) {
						let pointerType = (e.pointerType || 'mouse') as PointerType;

						// Problems with PointerEvent#movementX/movementY:
						// 1. it is always 0 on macOS Safari.
						// 2. On Chrome Android, it's scaled by devicePixelRatio, but not on Chrome macOS
						moveEvent(
							e,
							pointerType,
							e.pageX - (state.current.lastPosition?.pageX ?? 0),
							e.pageY - (state.current.lastPosition?.pageY ?? 0),
						);
						state.current.lastPosition = { pageX: e.pageX, pageY: e.pageY };
					}
				};

				let onPointerUp = (e: PointerEvent) => {
					if (e.pointerId === state.current.id) {
						let pointerType = (e.pointerType || 'mouse') as PointerType;
						endEvent(e, pointerType);
						state.current.id = null;
						let ownerWindow = getOwnerWindow(getEventTarget(e) as Element);
						removeGlobalListener(ownerWindow, 'pointermove', onPointerMove, false);
						removeGlobalListener(ownerWindow, 'pointerup', onPointerUp, false);
						removeGlobalListener(ownerWindow, 'pointercancel', onPointerUp, false);
					}
				};

				moveProps.onPointerDown = (e: PointerEvent) => {
					if (e.button === 0 && state.current.id == null) {
						start();
						e.stopPropagation();
						e.preventDefault();
						state.current.lastPosition = { pageX: e.pageX, pageY: e.pageY };
						state.current.id = e.pointerId;
						let ownerWindow = getOwnerWindow(getEventTarget(e) as Element);
						addGlobalListener(ownerWindow, 'pointermove', onPointerMove, false);
						addGlobalListener(ownerWindow, 'pointerup', onPointerUp, false);
						addGlobalListener(ownerWindow, 'pointercancel', onPointerUp, false);
					}
				};
			}

			let triggerKeyboardMove = (e: EventBase, deltaX: number, deltaY: number) => {
				start();
				moveEvent(e, 'keyboard', deltaX, deltaY);
				endEvent(e, 'keyboard');
			};

			moveProps.onKeyDown = (e: KeyboardEvent) => {
				switch (e.key) {
					case 'Left':
					case 'ArrowLeft':
						e.preventDefault();
						e.stopPropagation();
						triggerKeyboardMove(e, -1, 0);
						break;
					case 'Right':
					case 'ArrowRight':
						e.preventDefault();
						e.stopPropagation();
						triggerKeyboardMove(e, 1, 0);
						break;
					case 'Up':
					case 'ArrowUp':
						e.preventDefault();
						e.stopPropagation();
						triggerKeyboardMove(e, 0, -1);
						break;
					case 'Down':
					case 'ArrowDown':
						e.preventDefault();
						e.stopPropagation();
						triggerKeyboardMove(e, 0, 1);
						break;
				}
			};

			return moveProps;
		},
		[addGlobalListener, removeGlobalListener, state],
		subSlot(slot, 'moveProps'),
	);

	return { moveProps };
}
