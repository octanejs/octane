// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/usePress.ts).
// octane adaptations:
// - Handlers receive NATIVE events (there is no synthetic layer), so every upstream
//   `e.nativeEvent` read collapses to `e` itself: isValidKeyboardEvent(e.nativeEvent) /
//   isVirtualClick(e.nativeEvent) / isVirtualPointerEvent(e.nativeEvent) /
//   getTouchFromEvent(e.nativeEvent) / getTouchById(e.nativeEvent, …) /
//   metaKeyEvents.set(e.key, e.nativeEvent) / triggerSyntheticClick(e.nativeEvent, …) /
//   `(e.nativeEvent as PointerEvent).pointerType`. usePress's own PressEvent class and its
//   stopPropagation/continuePropagation mechanics are unchanged.
// - React's MouseEvent/TouchEvent/KeyboardEvent event types → native ones; handler params
//   carry explicit native annotations (upstream got them contextually from React's
//   DOMAttributes); `e.currentTarget` casts to Element/FocusableElement where React's
//   generic event types implied them (octane guarantees per-handler currentTarget).
// - `flushSync` imports from 'octane' (upstream: 'react-dom').
// - PressProps.onClick takes the native MouseEvent (upstream: React.MouseEvent
//   <FocusableElement> via PressEvents); `DOMAttributes` is a local structural prop-bag
//   alias (upstream's is typed over React's synthetic handlers).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.

// Portions of the code in this file are based on code from react.
// Original licensing for the following can be found in the
// NOTICE file in the root directory of this source tree.
// See https://github.com/facebook/react/tree/cc7c1aece46a6b69b41958d731e0fd27c94bfc6c/packages/react-interactions

import { chain } from '../utils/chain';

import { createSyntheticEvent, preventFocus, setEventTarget } from './utils';
import { disableTextSelection, restoreTextSelection } from './textSelection';
import type {
	FocusableElement,
	PressEvent as IPressEvent,
	PointerType,
	PressEvents,
	RefObject,
} from '@react-types/shared';
import { flushSync, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'octane';
import { focusWithoutScrolling } from '../utils/focusWithoutScrolling';
import { getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import { getNonce } from '../utils/getNonce';
import { getOwnerDocument, getOwnerWindow } from '../utils/domHelpers';
import { isMac } from '../utils/platform';
import { isVirtualClick, isVirtualPointerEvent } from '../utils/isVirtualEvent';
import { mergeProps } from '../utils/mergeProps';
import { openLink } from '../utils/openLink';
import { PressResponderContext } from './context';
import { S, splitSlot, subSlot } from '../internal';
import { useEffectEvent } from '../utils/useEffectEvent';
import { useGlobalListeners } from '../utils/useGlobalListeners';
import { useSyncRef } from '../utils/useSyncRef';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler/attribute types).
type DOMAttributes = Record<string, any>;

export interface PressProps extends Omit<PressEvents, 'onClick'> {
	/**
	 * **Not recommended – use `onPress` instead.** `onClick` is an alias for `onPress`
	 * provided for compatibility with other libraries. `onPress` provides
	 * additional event details for non-mouse interactions.
	 *
	 * octane adaptation: receives the NATIVE MouseEvent (or the augmented-native shim for
	 * the synthetic-click paths) rather than React's synthetic MouseEvent.
	 */
	onClick?: (e: MouseEvent) => void;
	/** Whether the target is in a controlled press state (e.g. an overlay it triggers is open). */
	isPressed?: boolean;
	/** Whether the press events should be disabled. */
	isDisabled?: boolean;
	/** Whether the target should not receive focus on press. */
	preventFocusOnPress?: boolean;
	/**
	 * Whether press events should be canceled when the pointer leaves the target while pressed.
	 * By default, this is `false`, which means if the pointer returns back over the target while
	 * still pressed, onPressStart will be fired again. If set to `true`, the press is canceled
	 * when the pointer leaves the target and onPressStart will not be fired if the pointer returns.
	 */
	shouldCancelOnPointerExit?: boolean;
	/** Whether text selection should be enabled on the pressable element. */
	allowTextSelectionOnPress?: boolean;
}

export interface PressHookProps extends PressProps {
	/** A ref to the target element. */
	ref?: RefObject<Element | null>;
}

interface PressState {
	isPressed: boolean;
	ignoreEmulatedMouseEvents: boolean;
	didFirePressStart: boolean;
	isTriggeringEvent: boolean;
	activePointerId: any;
	target: FocusableElement | null;
	isOverTarget: boolean;
	pointerType: PointerType | null;
	userSelect?: string;
	metaKeyEvents?: Map<string, KeyboardEvent>;
	disposables: Array<() => void>;
}

interface EventBase {
	currentTarget: EventTarget | null;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	clientX?: number;
	clientY?: number;
	targetTouches?: Array<{ clientX?: number; clientY?: number }>;
	key?: string;
}

export interface PressResult {
	/** Whether the target is currently pressed. */
	isPressed: boolean;
	/** Props to spread on the target element. */
	pressProps: DOMAttributes;
}

function usePressResponderContext(props: PressHookProps, slot: symbol | undefined): PressHookProps {
	// Consume context from <PressResponder> and merge with props.
	let context = useContext(PressResponderContext);
	if (context) {
		// Prevent mergeProps from merging ref.
		let { register, ref, ...contextProps } = context;
		props = mergeProps(contextProps, props) as PressHookProps;
		register();
	}
	useSyncRef(context, props.ref, subSlot(slot, 'sync'));

	return props;
}

class PressEvent implements IPressEvent {
	type: IPressEvent['type'];
	pointerType: PointerType;
	target: Element;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	x: number;
	y: number;
	key: string | undefined;
	#shouldStopPropagation = true;

	constructor(
		type: IPressEvent['type'],
		pointerType: PointerType,
		originalEvent: EventBase,
		state?: PressState,
	) {
		let currentTarget = state?.target ?? originalEvent.currentTarget;
		const rect: DOMRect | undefined = (currentTarget as Element)?.getBoundingClientRect();
		let x,
			y = 0;
		let clientX,
			clientY: number | null = null;
		if (originalEvent.clientX != null && originalEvent.clientY != null) {
			clientX = originalEvent.clientX;
			clientY = originalEvent.clientY;
		}
		if (rect) {
			if (clientX != null && clientY != null) {
				x = clientX - rect.left;
				y = clientY - rect.top;
			} else {
				x = rect.width / 2;
				y = rect.height / 2;
			}
		}
		this.type = type;
		this.pointerType = pointerType;
		this.target = originalEvent.currentTarget as Element;
		this.shiftKey = originalEvent.shiftKey;
		this.metaKey = originalEvent.metaKey;
		this.ctrlKey = originalEvent.ctrlKey;
		this.altKey = originalEvent.altKey;
		this.x = x!;
		this.y = y;
		this.key = originalEvent.key;
	}

	continuePropagation() {
		this.#shouldStopPropagation = false;
	}

	get shouldStopPropagation() {
		return this.#shouldStopPropagation;
	}
}

const LINK_CLICKED = Symbol('linkClicked');
const STYLE_ID = 'react-aria-pressable-style';
const PRESSABLE_ATTRIBUTE = 'data-react-aria-pressable';

/**
 * Handles press interactions across mouse, touch, keyboard, and screen readers.
 * It normalizes behavior across browsers and platforms, and handles many nuances
 * of dealing with pointer and keyboard events.
 */
export function usePress(props: PressHookProps, ...args: any[]): PressResult;
export function usePress(...args: any[]): PressResult {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePress');

	let {
		onPress,
		onPressChange,
		onPressStart,
		onPressEnd,
		onPressUp,
		onClick,
		isDisabled,
		isPressed: isPressedProp,
		preventFocusOnPress,
		shouldCancelOnPointerExit,
		allowTextSelectionOnPress,
		ref: domRef,
		...domProps
	} = usePressResponderContext(user[0] as PressHookProps, subSlot(slot, 'responder'));

	let [isPressed, setPressed] = useState(false, subSlot(slot, 'pressed'));
	let ref = useRef<PressState>(
		{
			isPressed: false,
			ignoreEmulatedMouseEvents: false,
			didFirePressStart: false,
			isTriggeringEvent: false,
			activePointerId: null,
			target: null,
			isOverTarget: false,
			pointerType: null,
			disposables: [],
		},
		subSlot(slot, 'state'),
	);

	let { addGlobalListener, removeAllGlobalListeners } = useGlobalListeners(
		subSlot(slot, 'listeners'),
	);

	let triggerPressStart = useCallback(
		(originalEvent: EventBase, pointerType: PointerType) => {
			let state = ref.current;
			if (isDisabled || state.didFirePressStart) {
				return false;
			}

			let shouldStopPropagation = true;
			state.isTriggeringEvent = true;
			if (onPressStart) {
				let event = new PressEvent('pressstart', pointerType, originalEvent);
				onPressStart(event);
				shouldStopPropagation = event.shouldStopPropagation;
			}

			if (onPressChange) {
				onPressChange(true);
			}

			state.isTriggeringEvent = false;
			state.didFirePressStart = true;
			setPressed(true);
			return shouldStopPropagation;
		},
		[isDisabled, onPressStart, onPressChange],
		subSlot(slot, 'start'),
	);

	let triggerPressEnd = useCallback(
		(originalEvent: EventBase, pointerType: PointerType, wasPressed = true) => {
			let state = ref.current;
			if (!state.didFirePressStart) {
				return false;
			}

			state.didFirePressStart = false;
			state.isTriggeringEvent = true;

			let shouldStopPropagation = true;
			if (onPressEnd) {
				let event = new PressEvent('pressend', pointerType, originalEvent);
				onPressEnd(event);
				shouldStopPropagation = event.shouldStopPropagation;
			}

			if (onPressChange) {
				onPressChange(false);
			}

			setPressed(false);

			if (onPress && wasPressed && !isDisabled) {
				let event = new PressEvent('press', pointerType, originalEvent);
				onPress(event);
				shouldStopPropagation &&= event.shouldStopPropagation;
			}

			state.isTriggeringEvent = false;
			return shouldStopPropagation;
		},
		[isDisabled, onPressEnd, onPressChange, onPress],
		subSlot(slot, 'end'),
	);
	let triggerPressEndEvent = useEffectEvent(triggerPressEnd, subSlot(slot, 'endEvent'));

	let triggerPressUp = useCallback(
		(originalEvent: EventBase, pointerType: PointerType) => {
			let state = ref.current;
			if (isDisabled) {
				return false;
			}

			if (onPressUp) {
				state.isTriggeringEvent = true;
				let event = new PressEvent('pressup', pointerType, originalEvent);
				onPressUp(event);
				state.isTriggeringEvent = false;
				return event.shouldStopPropagation;
			}

			return true;
		},
		[isDisabled, onPressUp],
		subSlot(slot, 'up'),
	);
	let triggerPressUpEvent = useEffectEvent(triggerPressUp, subSlot(slot, 'upEvent'));

	let cancel = useCallback(
		(e: EventBase) => {
			let state = ref.current;
			if (state.isPressed && state.target) {
				if (state.didFirePressStart && state.pointerType != null) {
					triggerPressEnd(createEvent(state.target, e), state.pointerType, false);
				}
				state.isPressed = false;
				state.isOverTarget = false;
				state.activePointerId = null;
				state.pointerType = null;
				removeAllGlobalListeners();
				if (!allowTextSelectionOnPress) {
					restoreTextSelection(state.target);
				}
				for (let dispose of state.disposables) {
					dispose();
				}
				state.disposables = [];
			}
		},
		[allowTextSelectionOnPress, removeAllGlobalListeners, triggerPressEnd],
		subSlot(slot, 'cancel'),
	);
	let cancelEvent = useEffectEvent(cancel, subSlot(slot, 'cancelEvent'));

	useEffect(
		() => {
			if (isDisabled && ref.current.isPressed) {
				cancelEvent({
					currentTarget: ref.current.target,
					shiftKey: false,
					ctrlKey: false,
					metaKey: false,
					altKey: false,
				});
			}
		},
		[isDisabled],
		subSlot(slot, 'disabledCancel'),
	);

	let cancelOnPointerExit = useCallback(
		(e: EventBase) => {
			if (shouldCancelOnPointerExit) {
				cancel(e);
			}
		},
		[shouldCancelOnPointerExit, cancel],
		subSlot(slot, 'pointerExit'),
	);

	let triggerClick = useCallback(
		(e: MouseEvent) => {
			if (isDisabled) {
				return;
			}

			onClick?.(e);
		},
		[isDisabled, onClick],
		subSlot(slot, 'click'),
	);

	let triggerSyntheticClick = useCallback(
		(e: KeyboardEvent | TouchEvent, target: FocusableElement) => {
			if (isDisabled) {
				return;
			}

			// Some third-party libraries pass in onClick instead of onPress.
			// Create a fake mouse event and trigger onClick as well.
			// This matches the browser's native activation behavior for certain elements (e.g. button).
			// https://html.spec.whatwg.org/#activation
			// https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event
			if (onClick) {
				let event = new MouseEvent('click', e);
				setEventTarget(event, target);
				onClick(createSyntheticEvent(event));
			}
		},
		[isDisabled, onClick],
		subSlot(slot, 'syntheticClick'),
	);

	let pressProps = useMemo(
		() => {
			let state = ref.current;
			let pressProps: DOMAttributes = {
				onKeyDown(e: KeyboardEvent) {
					if (
						isValidKeyboardEvent(e, e.currentTarget as Element) &&
						nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)
					) {
						if (shouldPreventDefaultKeyboard(getEventTarget(e) as Element, e.key)) {
							e.preventDefault();
						}

						// If the event is repeating, it may have started on a different element
						// after which focus moved to the current element. Ignore these events and
						// only handle the first key down event.
						let shouldStopPropagation = true;
						if (!state.isPressed && !e.repeat) {
							state.target = e.currentTarget as FocusableElement;
							state.isPressed = true;
							state.pointerType = 'keyboard';
							shouldStopPropagation = triggerPressStart(e, 'keyboard');
						}

						// Focus may move before the key up event, so register the event on the document
						// instead of the same element where the key down event occurred. Make it capturing so that it will trigger
						// before stopPropagation from useKeyboard on a child element may happen and thus we can still call triggerPress for the parent element.
						let originalTarget = e.currentTarget as Element;
						let pressUp = (e: KeyboardEvent) => {
							if (
								isValidKeyboardEvent(e, originalTarget) &&
								!e.repeat &&
								nodeContains(originalTarget, getEventTarget(e) as Element) &&
								state.target
							) {
								triggerPressUpEvent(createEvent(state.target, e), 'keyboard');
							}
						};

						addGlobalListener(
							getOwnerDocument(e.currentTarget as Element),
							'keyup',
							chain(pressUp, onKeyUp),
							true,
						);

						if (shouldStopPropagation) {
							e.stopPropagation();
						}

						// Keep track of the keydown events that occur while the Meta (e.g. Command) key is held.
						// macOS has a bug where keyup events are not fired while the Meta key is down.
						// When the Meta key itself is released we will get an event for that, and we'll act as if
						// all of these other keys were released as well.
						// https://bugs.chromium.org/p/chromium/issues/detail?id=1393524
						// https://bugs.webkit.org/show_bug.cgi?id=55291
						// https://bugzilla.mozilla.org/show_bug.cgi?id=1299553
						if (e.metaKey && isMac()) {
							state.metaKeyEvents?.set(e.key, e);
						}
					} else if (e.key === 'Meta') {
						state.metaKeyEvents = new Map();
					}
				},
				onClick(e: MouseEvent) {
					if (e && !nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					if (e && e.button === 0 && !state.isTriggeringEvent && !(openLink as any).isOpening) {
						let shouldStopPropagation = true;
						if (isDisabled) {
							e.preventDefault();
						}

						// If triggered from a screen reader or by using element.click(),
						// trigger as if it were a keyboard click.
						if (
							!state.ignoreEmulatedMouseEvents &&
							!state.isPressed &&
							(state.pointerType === 'virtual' || isVirtualClick(e))
						) {
							let stopPressStart = triggerPressStart(e, 'virtual');
							let stopPressUp = triggerPressUpEvent(e, 'virtual');
							let stopPressEnd = triggerPressEndEvent(e, 'virtual');
							triggerClick(e);
							shouldStopPropagation = stopPressStart && stopPressUp && stopPressEnd;
						} else if (state.isPressed && state.pointerType !== 'keyboard') {
							let pointerType =
								state.pointerType || ((e as PointerEvent).pointerType as PointerType) || 'virtual';
							let stopPressUp = triggerPressUpEvent(
								createEvent(e.currentTarget as FocusableElement, e),
								pointerType,
							);
							let stopPressEnd = triggerPressEndEvent(
								createEvent(e.currentTarget as FocusableElement, e),
								pointerType,
								true,
							);
							shouldStopPropagation = stopPressUp && stopPressEnd;
							state.isOverTarget = false;
							triggerClick(e);
							cancelEvent(e);
						}

						state.ignoreEmulatedMouseEvents = false;
						if (shouldStopPropagation) {
							e.stopPropagation();
						}
					}
				},
			};

			let onKeyUp = (e: KeyboardEvent) => {
				if (state.isPressed && state.target && isValidKeyboardEvent(e, state.target)) {
					if (shouldPreventDefaultKeyboard(getEventTarget(e) as Element, e.key)) {
						e.preventDefault();
					}

					let target = getEventTarget(e);
					let wasPressed = nodeContains(state.target, target as Element);
					triggerPressEndEvent(createEvent(state.target, e), 'keyboard', wasPressed);
					if (wasPressed) {
						triggerSyntheticClick(e, state.target);
					}
					removeAllGlobalListeners();

					// If a link was triggered with a key other than Enter, open the URL ourselves.
					// This means the link has a role override, and the default browser behavior
					// only applies when using the Enter key.
					if (
						e.key !== 'Enter' &&
						isHTMLAnchorLink(state.target) &&
						nodeContains(state.target, target as Element) &&
						!(e as any)[LINK_CLICKED]
					) {
						// Store a hidden property on the event so we only trigger link click once,
						// even if there are multiple usePress instances attached to the element.
						(e as any)[LINK_CLICKED] = true;
						openLink(state.target, e, false);
					}

					state.isPressed = false;
					state.metaKeyEvents?.delete(e.key);
				} else if (e.key === 'Meta' && state.metaKeyEvents?.size) {
					// If we recorded keydown events that occurred while the Meta key was pressed,
					// and those haven't received keyup events already, fire keyup events ourselves.
					// See comment above for more info about the macOS bug causing this.
					let events = state.metaKeyEvents;
					state.metaKeyEvents = undefined;
					for (let event of events.values()) {
						state.target?.dispatchEvent(new KeyboardEvent('keyup', event));
					}
				}
			};

			if (typeof PointerEvent !== 'undefined') {
				pressProps.onPointerDown = (e: PointerEvent) => {
					// Only handle left clicks, and ignore events that bubbled through portals.
					if (
						e.button !== 0 ||
						!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)
					) {
						return;
					}

					// iOS safari fires pointer events from VoiceOver with incorrect coordinates/target.
					// Ignore and let the onClick handler take care of it instead.
					// https://bugs.webkit.org/show_bug.cgi?id=222627
					// https://bugs.webkit.org/show_bug.cgi?id=223202
					if (isVirtualPointerEvent(e)) {
						state.pointerType = 'virtual';
						return;
					}

					state.pointerType = e.pointerType as PointerType;

					let shouldStopPropagation = true;
					if (!state.isPressed) {
						state.isPressed = true;
						state.isOverTarget = true;
						state.activePointerId = e.pointerId;
						state.target = e.currentTarget as FocusableElement;

						if (!allowTextSelectionOnPress) {
							disableTextSelection(state.target);
						}

						shouldStopPropagation = triggerPressStart(e, state.pointerType);

						// Release pointer capture so that touch interactions can leave the original target.
						// This enables onPointerLeave and onPointerEnter to fire.
						let target = getEventTarget(e);
						if ('releasePointerCapture' in target) {
							if ('hasPointerCapture' in target) {
								if ((target as Element).hasPointerCapture(e.pointerId)) {
									(target as Element).releasePointerCapture(e.pointerId);
								}
							} else {
								(target as Element).releasePointerCapture(e.pointerId);
							}
						}
						addGlobalListener(
							getOwnerDocument(e.currentTarget as Element),
							'pointerup',
							onPointerUp,
							false,
						);
						addGlobalListener(
							getOwnerDocument(e.currentTarget as Element),
							'pointercancel',
							onPointerCancel,
							false,
						);
					}

					if (shouldStopPropagation) {
						e.stopPropagation();
					}
				};

				pressProps.onMouseDown = (e: MouseEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					if (e.button === 0) {
						if (preventFocusOnPress) {
							let dispose = preventFocus(e.target as FocusableElement);
							if (dispose) {
								state.disposables.push(dispose);
							}
						}

						e.stopPropagation();
					}
				};

				pressProps.onPointerUp = (e: PointerEvent) => {
					// iOS fires pointerup with zero width and height, so check the pointerType recorded during pointerdown.
					if (
						!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element) ||
						state.pointerType === 'virtual'
					) {
						return;
					}

					// Only handle left clicks. If isPressed is true, delay until onClick.
					if (e.button === 0 && !state.isPressed) {
						triggerPressUpEvent(e, state.pointerType || (e.pointerType as PointerType));
					}
				};

				pressProps.onPointerEnter = (e: PointerEvent) => {
					if (
						e.pointerId === state.activePointerId &&
						state.target &&
						!state.isOverTarget &&
						state.pointerType != null
					) {
						state.isOverTarget = true;
						triggerPressStart(createEvent(state.target, e), state.pointerType);
					}
				};

				pressProps.onPointerLeave = (e: PointerEvent) => {
					if (
						e.pointerId === state.activePointerId &&
						state.target &&
						state.isOverTarget &&
						state.pointerType != null
					) {
						state.isOverTarget = false;
						triggerPressEndEvent(createEvent(state.target, e), state.pointerType, false);
						cancelOnPointerExit(e);
					}
				};

				let onPointerUp = (e: PointerEvent) => {
					if (
						e.pointerId === state.activePointerId &&
						state.isPressed &&
						e.button === 0 &&
						state.target
					) {
						if (
							nodeContains(state.target, getEventTarget(e) as Element) &&
							state.pointerType != null
						) {
							// Wait for onClick to fire onPress. This avoids browser issues when the DOM
							// is mutated between onPointerUp and onClick, and is more compatible with third party libraries.
							// https://github.com/adobe/react-spectrum/issues/1513
							// https://issues.chromium.org/issues/40732224
							// However, iOS and Android do not focus or fire onClick after a long press.
							// We work around this by triggering a click ourselves after a timeout.
							// This timeout is canceled during the click event in case the real one fires first.
							// The timeout must be at least 32ms, because Safari on iOS delays the click event on
							// non-form elements without certain ARIA roles (for hover emulation).
							// https://github.com/WebKit/WebKit/blob/dccfae42bb29bd4bdef052e469f604a9387241c0/Source/WebKit/WebProcess/WebPage/ios/WebPageIOS.mm#L875-L892
							let clicked = false;
							let timeout = setTimeout(() => {
								if (state.isPressed && state.target instanceof HTMLElement) {
									if (clicked) {
										cancelEvent(e);
									} else {
										focusWithoutScrolling(state.target);
										state.target.click();
									}
								}
							}, 80);
							// Use a capturing listener to track if a click occurred.
							// If stopPropagation is called it may never reach our handler.
							addGlobalListener(e.currentTarget as Document, 'click', () => (clicked = true), true);
							state.disposables.push(() => clearTimeout(timeout));
						} else {
							cancelEvent(e);
						}

						// Ignore subsequent onPointerLeave event before onClick on touch devices.
						state.isOverTarget = false;
					}
				};

				let onPointerCancel = (e: PointerEvent) => {
					cancelEvent(e);
				};

				pressProps.onDragStart = (e: DragEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					// Safari does not call onPointerCancel when a drag starts, whereas Chrome and Firefox do.
					cancelEvent(e);
				};
			} else if (process.env.NODE_ENV === 'test') {
				// NOTE: this fallback branch is entirely used by unit tests.
				// All browsers now support pointer events, but JSDOM still does not.

				pressProps.onMouseDown = (e: MouseEvent) => {
					// Only handle left clicks
					if (
						e.button !== 0 ||
						!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)
					) {
						return;
					}

					if (state.ignoreEmulatedMouseEvents) {
						e.stopPropagation();
						return;
					}

					state.isPressed = true;
					state.isOverTarget = true;
					state.target = e.currentTarget as FocusableElement;
					state.pointerType = isVirtualClick(e) ? 'virtual' : 'mouse';

					// Flush sync so that focus moved during react re-renders occurs before we yield back to the browser.
					let shouldStopPropagation = flushSync(() => triggerPressStart(e, state.pointerType!));
					if (shouldStopPropagation) {
						e.stopPropagation();
					}

					if (preventFocusOnPress) {
						let dispose = preventFocus(e.target as FocusableElement);
						if (dispose) {
							state.disposables.push(dispose);
						}
					}
					addGlobalListener(
						getOwnerDocument(e.currentTarget as Element),
						'mouseup',
						onMouseUp,
						false,
					);
				};

				pressProps.onMouseEnter = (e: MouseEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					let shouldStopPropagation = true;
					if (state.isPressed && !state.ignoreEmulatedMouseEvents && state.pointerType != null) {
						state.isOverTarget = true;
						shouldStopPropagation = triggerPressStart(e, state.pointerType);
					}

					if (shouldStopPropagation) {
						e.stopPropagation();
					}
				};

				pressProps.onMouseLeave = (e: MouseEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					let shouldStopPropagation = true;
					if (state.isPressed && !state.ignoreEmulatedMouseEvents && state.pointerType != null) {
						state.isOverTarget = false;
						shouldStopPropagation = triggerPressEndEvent(e, state.pointerType, false);
						cancelOnPointerExit(e);
					}

					if (shouldStopPropagation) {
						e.stopPropagation();
					}
				};

				pressProps.onMouseUp = (e: MouseEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					if (!state.ignoreEmulatedMouseEvents && e.button === 0 && !state.isPressed) {
						triggerPressUpEvent(e, state.pointerType || 'mouse');
					}
				};

				let onMouseUp = (e: MouseEvent) => {
					// Only handle left clicks
					if (e.button !== 0) {
						return;
					}

					if (state.ignoreEmulatedMouseEvents) {
						state.ignoreEmulatedMouseEvents = false;
						return;
					}

					if (
						state.target &&
						nodeContains(state.target, getEventTarget(e) as Element) &&
						state.pointerType != null
					) {
						// Wait for onClick to fire onPress. This avoids browser issues when the DOM
						// is mutated between onMouseUp and onClick, and is more compatible with third party libraries.
					} else {
						cancelEvent(e);
					}

					state.isOverTarget = false;
				};

				pressProps.onTouchStart = (e: TouchEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					let touch = getTouchFromEvent(e);
					if (!touch) {
						return;
					}
					state.activePointerId = touch.identifier;
					state.ignoreEmulatedMouseEvents = true;
					state.isOverTarget = true;
					state.isPressed = true;
					state.target = e.currentTarget as FocusableElement;
					state.pointerType = 'touch';

					if (!allowTextSelectionOnPress) {
						disableTextSelection(state.target);
					}

					let shouldStopPropagation = triggerPressStart(
						createTouchEvent(state.target, e),
						state.pointerType,
					);
					if (shouldStopPropagation) {
						e.stopPropagation();
					}
					addGlobalListener(getOwnerWindow(e.currentTarget as Element), 'scroll', onScroll, true);
				};

				pressProps.onTouchMove = (e: TouchEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					if (!state.isPressed) {
						e.stopPropagation();
						return;
					}

					let touch = getTouchById(e, state.activePointerId);
					let shouldStopPropagation = true;
					if (touch && isOverTarget(touch, e.currentTarget as Element)) {
						if (!state.isOverTarget && state.pointerType != null) {
							state.isOverTarget = true;
							shouldStopPropagation = triggerPressStart(
								createTouchEvent(state.target!, e),
								state.pointerType,
							);
						}
					} else if (state.isOverTarget && state.pointerType != null) {
						state.isOverTarget = false;
						shouldStopPropagation = triggerPressEndEvent(
							createTouchEvent(state.target!, e),
							state.pointerType,
							false,
						);
						cancelOnPointerExit(createTouchEvent(state.target!, e));
					}

					if (shouldStopPropagation) {
						e.stopPropagation();
					}
				};

				pressProps.onTouchEnd = (e: TouchEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					if (!state.isPressed) {
						e.stopPropagation();
						return;
					}

					let touch = getTouchById(e, state.activePointerId);
					let shouldStopPropagation = true;
					if (
						touch &&
						isOverTarget(touch, e.currentTarget as Element) &&
						state.pointerType != null
					) {
						triggerPressUpEvent(createTouchEvent(state.target!, e), state.pointerType);
						shouldStopPropagation = triggerPressEndEvent(
							createTouchEvent(state.target!, e),
							state.pointerType,
						);
						triggerSyntheticClick(e, state.target!);
					} else if (state.isOverTarget && state.pointerType != null) {
						shouldStopPropagation = triggerPressEndEvent(
							createTouchEvent(state.target!, e),
							state.pointerType,
							false,
						);
					}

					if (shouldStopPropagation) {
						e.stopPropagation();
					}

					state.isPressed = false;
					state.activePointerId = null;
					state.isOverTarget = false;
					state.ignoreEmulatedMouseEvents = true;
					if (state.target && !allowTextSelectionOnPress) {
						restoreTextSelection(state.target);
					}
					removeAllGlobalListeners();
				};

				pressProps.onTouchCancel = (e: TouchEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					e.stopPropagation();
					if (state.isPressed) {
						cancelEvent(createTouchEvent(state.target!, e));
					}
				};

				let onScroll = (e: Event) => {
					if (state.isPressed && nodeContains(getEventTarget(e) as Element, state.target)) {
						cancelEvent({
							currentTarget: state.target,
							shiftKey: false,
							ctrlKey: false,
							metaKey: false,
							altKey: false,
						});
					}
				};

				pressProps.onDragStart = (e: DragEvent) => {
					if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
						return;
					}

					cancelEvent(e);
				};
			}

			return pressProps;
		},
		[
			addGlobalListener,
			isDisabled,
			preventFocusOnPress,
			removeAllGlobalListeners,
			allowTextSelectionOnPress,
			cancelOnPointerExit,
			triggerPressStart,
			triggerClick,
			triggerSyntheticClick,
		],
		subSlot(slot, 'pressProps'),
	);

	// Avoid onClick delay for double tap to zoom by default.
	useEffect(
		() => {
			if (!domRef || process.env.NODE_ENV === 'test') {
				return;
			}

			const ownerDocument = getOwnerDocument(domRef.current);
			if (!ownerDocument || !ownerDocument.head || ownerDocument.getElementById(STYLE_ID)) {
				return;
			}

			const style = ownerDocument.createElement('style');
			style.id = STYLE_ID;
			let nonce = getNonce(ownerDocument);
			if (nonce) {
				style.nonce = nonce;
			}
			// touchAction: 'manipulation' is supposed to be equivalent, but in
			// Safari it causes onPointerCancel not to fire on scroll.
			// https://bugs.webkit.org/show_bug.cgi?id=240917
			style.textContent = `
@layer {
  [${PRESSABLE_ATTRIBUTE}] {
    touch-action: pan-x pan-y pinch-zoom;
  }
}
    `.trim();
			ownerDocument.head.prepend(style);
		},
		[domRef],
		subSlot(slot, 'style'),
	);

	// Remove user-select: none in case component unmounts immediately after pressStart
	useEffect(
		() => {
			let state = ref.current;
			return () => {
				if (!allowTextSelectionOnPress) {
					restoreTextSelection(state.target ?? undefined);
				}
				for (let dispose of state.disposables) {
					dispose();
				}
				state.disposables = [];
			};
		},
		[allowTextSelectionOnPress],
		subSlot(slot, 'restore'),
	);

	return {
		isPressed: isPressedProp || isPressed,
		pressProps: mergeProps(domProps, pressProps, { [PRESSABLE_ATTRIBUTE]: true }),
	};
}

function isHTMLAnchorLink(target: Element): target is HTMLAnchorElement {
	return target.tagName === 'A' && target.hasAttribute('href');
}

function isValidKeyboardEvent(event: KeyboardEvent, currentTarget: Element): boolean {
	const { key, code } = event;
	const element = currentTarget as HTMLElement;
	const role = element.getAttribute('role');
	// Accessibility for keyboards. Space and Enter only.
	// "Spacebar" is for IE 11
	return (
		(key === 'Enter' || key === ' ' || key === 'Spacebar' || code === 'Space') &&
		!(
			(element instanceof getOwnerWindow(element).HTMLInputElement &&
				!isValidInputKey(element, key)) ||
			element instanceof getOwnerWindow(element).HTMLTextAreaElement ||
			element.isContentEditable
		) &&
		// Links should only trigger with Enter key
		!((role === 'link' || (!role && isHTMLAnchorLink(element))) && key !== 'Enter')
	);
}

function getTouchFromEvent(event: TouchEvent): Touch | null {
	const { targetTouches } = event;
	if (targetTouches.length > 0) {
		return targetTouches[0];
	}
	return null;
}

function getTouchById(event: TouchEvent, pointerId: null | number): null | Touch {
	const changedTouches = event.changedTouches;
	for (let i = 0; i < changedTouches.length; i++) {
		const touch = changedTouches[i];
		if (touch.identifier === pointerId) {
			return touch;
		}
	}
	return null;
}

function createTouchEvent(target: FocusableElement, e: TouchEvent): EventBase {
	let clientX = 0;
	let clientY = 0;
	if (e.targetTouches && e.targetTouches.length === 1) {
		clientX = e.targetTouches[0].clientX;
		clientY = e.targetTouches[0].clientY;
	}
	return {
		currentTarget: target,
		shiftKey: e.shiftKey,
		ctrlKey: e.ctrlKey,
		metaKey: e.metaKey,
		altKey: e.altKey,
		clientX,
		clientY,
	};
}

function createEvent(target: FocusableElement, e: EventBase): EventBase {
	let clientX = e.clientX;
	let clientY = e.clientY;
	return {
		currentTarget: target,
		shiftKey: e.shiftKey,
		ctrlKey: e.ctrlKey,
		metaKey: e.metaKey,
		altKey: e.altKey,
		clientX,
		clientY,
		key: e.key,
	};
}

interface Rect {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

interface EventPoint {
	clientX: number;
	clientY: number;
	width?: number;
	height?: number;
	radiusX?: number;
	radiusY?: number;
}

function getPointClientRect(point: EventPoint): Rect {
	let offsetX = 0;
	let offsetY = 0;
	if (point.width !== undefined) {
		offsetX = point.width / 2;
	} else if (point.radiusX !== undefined) {
		offsetX = point.radiusX;
	}
	if (point.height !== undefined) {
		offsetY = point.height / 2;
	} else if (point.radiusY !== undefined) {
		offsetY = point.radiusY;
	}

	return {
		top: point.clientY - offsetY,
		right: point.clientX + offsetX,
		bottom: point.clientY + offsetY,
		left: point.clientX - offsetX,
	};
}

function areRectanglesOverlapping(a: Rect, b: Rect) {
	// check if they cannot overlap on x axis
	if (a.left > b.right || b.left > a.right) {
		return false;
	}
	// check if they cannot overlap on y axis
	if (a.top > b.bottom || b.top > a.bottom) {
		return false;
	}
	return true;
}

function isOverTarget(point: EventPoint, target: Element) {
	let rect = target.getBoundingClientRect();
	let pointRect = getPointClientRect(point);
	return areRectanglesOverlapping(rect, pointRect);
}

function shouldPreventDefaultUp(target: Element) {
	if (target instanceof HTMLInputElement) {
		return false;
	}

	if (target instanceof HTMLButtonElement) {
		return target.type !== 'submit' && target.type !== 'reset';
	}

	if (isHTMLAnchorLink(target)) {
		return false;
	}

	return true;
}

function shouldPreventDefaultKeyboard(target: Element, key: string) {
	if (target instanceof HTMLInputElement) {
		return !isValidInputKey(target, key);
	}

	return shouldPreventDefaultUp(target);
}

const nonTextInputTypes = new Set([
	'checkbox',
	'radio',
	'range',
	'color',
	'file',
	'image',
	'button',
	'submit',
	'reset',
]);

function isValidInputKey(target: HTMLInputElement, key: string) {
	// Only space should toggle checkboxes and radios, not enter.
	return target.type === 'checkbox' || target.type === 'radio'
		? key === ' '
		: nonTextInputTypes.has(target.type);
}
