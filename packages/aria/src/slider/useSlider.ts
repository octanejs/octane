// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/slider/useSlider.ts).
// octane adaptations:
// - Handlers receive NATIVE events (there is no synthetic layer): the track's
//   onMouseDown/onPointerDown/onTouchStart props take native MouseEvent/PointerEvent/
//   TouchEvent, and `onDownTrack`'s event parameter is the native event union.
// - React's LabelHTMLAttributes/OutputHTMLAttributes element types collapse to the local
//   structural `DOMAttributes` prop bag.
// - `clamp` comes from the ported stately number utils; `SliderProps`/`SliderState` from
//   the ported stately slider hook.
// - Public-hook slot threading (splitSlot/subSlot).
import type { AriaLabelingProps, DOMProps, RefObject } from '@react-types/shared';
import { clamp } from '../stately/utils/number';
import { getSliderThumbId, sliderData } from './utils';
import { mergeProps } from '../utils/mergeProps';
import { useRef } from 'octane';
import { setInteractionModality } from '../interactions/useFocusVisible';
import type { SliderProps, SliderState } from '../stately/slider/useSliderState';
import { useGlobalListeners } from '../utils/useGlobalListeners';
import { useLabel } from '../label/useLabel';
import { useLocale } from '../i18n/I18nProvider';
import { useMove } from '../interactions/useMove';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaSliderProps<T = number | number[]>
	extends SliderProps<T>, DOMProps, AriaLabelingProps {}

export interface SliderAria {
	/** Props for the label element. */
	labelProps: DOMAttributes;

	/** Props for the root element of the slider component; groups slider inputs. */
	groupProps: DOMAttributes;

	/** Props for the track element. */
	trackProps: DOMAttributes;

	/** Props for the output element, displaying the value of the slider thumbs. */
	outputProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a slider component representing one or
 * more values.
 *
 * @param props Props for the slider.
 * @param state State for the slider, as returned by `useSliderState`.
 * @param trackRef Ref for the "track" element.  The width of this element provides the "length"
 *   of the track -- the span of one dimensional space that the slider thumb can be.  It also
 *   accepts click and drag motions, so that the closest thumb will follow clicks and drags on
 *   the track.
 */
export function useSlider<T extends number | number[]>(
	props: AriaSliderProps<T>,
	state: SliderState,
	trackRef: RefObject<Element | null>,
): SliderAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSlider<T extends number | number[]>(
	props: AriaSliderProps<T>,
	state: SliderState,
	trackRef: RefObject<Element | null>,
	slot: symbol | undefined,
): SliderAria;
export function useSlider(...args: any[]): SliderAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSlider');
	const props = user[0] as AriaSliderProps<any>;
	const state = user[1] as SliderState;
	const trackRef = user[2] as RefObject<Element | null>;

	let { labelProps, fieldProps } = useLabel(props, subSlot(slot, 'label'));

	let isVertical = props.orientation === 'vertical';

	// Attach id of the label to the state so it can be accessed by useSliderThumb.
	sliderData.set(state, {
		id: (labelProps.id ?? fieldProps.id)!,
		'aria-describedby': props['aria-describedby'],
		'aria-details': props['aria-details'],
	});

	let { direction } = useLocale(subSlot(slot, 'locale'));

	let { addGlobalListener, removeGlobalListener } = useGlobalListeners(
		subSlot(slot, 'globalListeners'),
	);

	// When the user clicks or drags the track, we want the motion to set and drag the
	// closest thumb.  Hence we also need to install useMove() on the track element.
	// Here, we keep track of which index is the "closest" to the drag start point.
	// It is set onMouseDown/onTouchDown; see trackProps below.
	const realTimeTrackDraggingIndex = useRef<number | null>(null, subSlot(slot, 'dragIndex'));

	const reverseX = direction === 'rtl';
	const currentPosition = useRef<number | null>(null, subSlot(slot, 'position'));
	const { moveProps } = useMove(
		{
			onMoveStart() {
				currentPosition.current = null;
			},
			onMove({ deltaX, deltaY }) {
				if (!trackRef.current) {
					return;
				}
				let { height, width } = trackRef.current.getBoundingClientRect();
				let size = isVertical ? height : width;

				if (currentPosition.current == null && realTimeTrackDraggingIndex.current != null) {
					currentPosition.current =
						state.getThumbPercent(realTimeTrackDraggingIndex.current) * size;
				}

				let delta = isVertical ? deltaY : deltaX;
				if (isVertical || reverseX) {
					delta = -delta;
				}

				currentPosition.current! += delta;

				if (realTimeTrackDraggingIndex.current != null && trackRef.current) {
					const percent = clamp(currentPosition.current! / size, 0, 1);
					state.setThumbPercent(realTimeTrackDraggingIndex.current, percent);
				}
			},
			onMoveEnd() {
				if (realTimeTrackDraggingIndex.current != null) {
					state.setThumbDragging(realTimeTrackDraggingIndex.current, false);
					realTimeTrackDraggingIndex.current = null;
				}
			},
		},
		subSlot(slot, 'move'),
	);

	let currentPointer = useRef<number | null | undefined>(undefined, subSlot(slot, 'pointer'));
	let onDownTrack = (
		e: MouseEvent | PointerEvent | TouchEvent,
		id: number | undefined,
		clientX: number,
		clientY: number,
	) => {
		// We only trigger track-dragging if the user clicks on the track itself and nothing is currently being dragged.
		if (
			trackRef.current &&
			!props.isDisabled &&
			state.values.every((_, i) => !state.isThumbDragging(i))
		) {
			let { height, width, top, left } = trackRef.current.getBoundingClientRect();
			let size = isVertical ? height : width;
			// Find the closest thumb
			const trackPosition = isVertical ? top : left;
			const clickPosition = isVertical ? clientY : clientX;
			const offset = clickPosition - trackPosition;
			let percent = offset / size;
			if (direction === 'rtl' || isVertical) {
				percent = 1 - percent;
			}
			let value = state.getPercentValue(percent);

			// to find the closet thumb we split the array based on the first thumb position to the "right/end" of the click.
			let closestThumb;
			let split = state.values.findIndex((v) => value - v < 0);
			if (split === 0) {
				// If the index is zero then the closetThumb is the first one
				closestThumb = split;
			} else if (split === -1) {
				// If no index is found they've clicked past all the thumbs
				closestThumb = state.values.length - 1;
			} else {
				let lastLeft = state.values[split - 1];
				let firstRight = state.values[split];
				// Pick the last left/start thumb, unless they are stacked on top of each other, then pick the right/end one
				if (Math.abs(lastLeft - value) < Math.abs(firstRight - value)) {
					closestThumb = split - 1;
				} else {
					closestThumb = split;
				}
			}

			// Confirm that the found closest thumb is editable, not disabled, and move it
			if (closestThumb >= 0 && state.isThumbEditable(closestThumb)) {
				// Don't unfocus anything
				e.preventDefault();

				realTimeTrackDraggingIndex.current = closestThumb;
				state.setFocusedThumb(closestThumb);
				currentPointer.current = id;

				state.setThumbDragging(realTimeTrackDraggingIndex.current!, true);
				state.setThumbValue(closestThumb, value);

				addGlobalListener(window, 'mouseup', onUpTrack, false);
				addGlobalListener(window, 'touchend', onUpTrack, false);
				addGlobalListener(window, 'pointerup', onUpTrack, false);
			} else {
				realTimeTrackDraggingIndex.current = null;
			}
		}
	};

	let onUpTrack = (e: any) => {
		let id = e.pointerId ?? e.changedTouches?.[0].identifier;
		if (id === currentPointer.current) {
			if (realTimeTrackDraggingIndex.current != null) {
				state.setThumbDragging(realTimeTrackDraggingIndex.current, false);
				realTimeTrackDraggingIndex.current = null;
			}

			removeGlobalListener(window, 'mouseup', onUpTrack, false);
			removeGlobalListener(window, 'touchend', onUpTrack, false);
			removeGlobalListener(window, 'pointerup', onUpTrack, false);
		}
	};

	if ('htmlFor' in labelProps && labelProps.htmlFor) {
		// Ideally the `for` attribute should point to the first thumb, but VoiceOver on iOS
		// causes this to override the `aria-labelledby` on the thumb. This causes the first
		// thumb to only be announced as the slider label rather than its individual name as well.
		// See https://bugs.webkit.org/show_bug.cgi?id=172464.
		delete labelProps.htmlFor;
		labelProps.onClick = () => {
			// Safari does not focus <input type="range"> elements when clicking on an associated <label>,
			// so do it manually. In addition, make sure we show the focus ring.
			document.getElementById(getSliderThumbId(state, 0))?.focus();
			setInteractionModality('keyboard');
		};
	}

	return {
		labelProps,
		// The root element of the Slider will have role="group" to group together
		// all the thumb inputs in the Slider.  The label of the Slider will
		// be used to label the group.
		groupProps: {
			role: 'group',
			...fieldProps,
		},
		trackProps: mergeProps(
			{
				onMouseDown(e: MouseEvent) {
					if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey) {
						return;
					}
					onDownTrack(e, undefined, e.clientX, e.clientY);
				},
				onPointerDown(e: PointerEvent) {
					if (e.pointerType === 'mouse' && (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey)) {
						return;
					}
					onDownTrack(e, e.pointerId, e.clientX, e.clientY);
				},
				onTouchStart(e: TouchEvent) {
					onDownTrack(
						e,
						e.changedTouches[0].identifier,
						e.changedTouches[0].clientX,
						e.changedTouches[0].clientY,
					);
				},
				style: {
					position: 'relative',
					touchAction: 'none',
				},
			},
			moveProps,
		),
		outputProps: {
			htmlFor: state.values.map((_, index) => getSliderThumbId(state, index)).join(' '),
			'aria-live': 'off',
		},
	};
}
