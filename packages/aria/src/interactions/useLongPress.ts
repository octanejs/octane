// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useLongPress.ts).
// octane adaptations:
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over React's
//   synthetic handlers); the `contextmenu` listener param carries an explicit native
//   annotation (upstream got it contextually).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type { FocusableElement, LongPressEvent } from '@react-types/shared';
import { focusWithoutScrolling } from '../utils/focusWithoutScrolling';
import { getOwnerDocument, getOwnerWindow } from '../utils/domHelpers';
import { mergeProps } from '../utils/mergeProps';
import { S, splitSlot, subSlot } from '../internal';
import { useDescription } from '../utils/useDescription';
import { useGlobalListeners } from '../utils/useGlobalListeners';
import { usePress } from './usePress';
import { useRef } from 'octane';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler/attribute types).
type DOMAttributes = Record<string, any>;

export interface LongPressProps {
	/** Whether long press events should be disabled. */
	isDisabled?: boolean;
	/** Handler that is called when a long press interaction starts. */
	onLongPressStart?: (e: LongPressEvent) => void;
	/**
	 * Handler that is called when a long press interaction ends, either
	 * over the target or when the pointer leaves the target.
	 */
	onLongPressEnd?: (e: LongPressEvent) => void;
	/**
	 * Handler that is called when the threshold time is met while
	 * the press is over the target.
	 */
	onLongPress?: (e: LongPressEvent) => void;
	/**
	 * The amount of time in milliseconds to wait before triggering a long press.
	 *
	 * @default 500ms
	 */
	threshold?: number;
	/**
	 * A description for assistive techology users indicating that a long press
	 * action is available, e.g. "Long press to open menu".
	 */
	accessibilityDescription?: string;
}

export interface LongPressResult {
	/** Props to spread on the target element. */
	longPressProps: DOMAttributes;
}

const DEFAULT_THRESHOLD = 500;

/**
 * Handles long press interactions across mouse and touch devices. Supports a customizable time
 * threshold, accessibility description, and normalizes behavior across browsers and devices.
 */
export function useLongPress(props: LongPressProps, ...args: any[]): LongPressResult;
export function useLongPress(...args: any[]): LongPressResult {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLongPress');
	const props = user[0] as LongPressProps;

	let {
		isDisabled,
		onLongPressStart,
		onLongPressEnd,
		onLongPress,
		threshold = DEFAULT_THRESHOLD,
		accessibilityDescription,
	} = props;

	const timeRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
		subSlot(slot, 'timer'),
	);
	let { addGlobalListener, removeGlobalListener } = useGlobalListeners(subSlot(slot, 'listeners'));

	let { pressProps } = usePress(
		{
			isDisabled,
			onPressStart(e) {
				e.continuePropagation();
				if (e.pointerType === 'mouse' || e.pointerType === 'touch') {
					if (onLongPressStart) {
						onLongPressStart({
							...e,
							type: 'longpressstart',
						});
					}

					timeRef.current = setTimeout(() => {
						// Prevent other usePress handlers from also handling this event.
						e.target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));

						// Ensure target is focused. On touch devices, browsers typically focus on pointer up.
						if (getOwnerDocument(e.target).activeElement !== e.target) {
							focusWithoutScrolling(e.target as FocusableElement);
						}

						if (onLongPress) {
							onLongPress({
								...e,
								type: 'longpress',
							});
						}
						timeRef.current = undefined;
					}, threshold);

					// Prevent context menu, which may be opened on long press on touch devices
					if (e.pointerType === 'touch') {
						let onContextMenu = (e: Event) => {
							e.preventDefault();
						};

						let ownerWindow = getOwnerWindow(e.target);
						addGlobalListener(e.target, 'contextmenu', onContextMenu, { once: true });
						addGlobalListener(
							ownerWindow,
							'pointerup',
							() => {
								// If no contextmenu event is fired quickly after pointerup, remove the handler
								// so future context menu events outside a long press are not prevented.
								setTimeout(() => {
									removeGlobalListener(e.target, 'contextmenu', onContextMenu);
								}, 30);
							},
							{ once: true },
						);
					}
				}
			},
			onPressEnd(e) {
				if (timeRef.current) {
					clearTimeout(timeRef.current);
				}

				if (onLongPressEnd && (e.pointerType === 'mouse' || e.pointerType === 'touch')) {
					onLongPressEnd({
						...e,
						type: 'longpressend',
					});
				}
			},
		},
		subSlot(slot, 'press'),
	);

	let descriptionProps = useDescription(
		onLongPress && !isDisabled ? accessibilityDescription : undefined,
		subSlot(slot, 'description'),
	);

	return {
		longPressProps: mergeProps(pressProps, descriptionProps),
	};
}
