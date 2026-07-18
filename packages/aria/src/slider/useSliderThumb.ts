// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/slider/useSliderThumb.ts).
// octane adaptations:
// - Handlers receive NATIVE events. The visually-hidden range input's value listener is
//   `onInput` (octane has no synthetic onChange; for range inputs React's onChange fires
//   on the native `input` event, so the timing is identical — this mirrors how the browser
//   reports native keyboard/drag stepping of a range input).
// - React's InputHTMLAttributes/LabelHTMLAttributes element types collapse to the local
//   structural `DOMAttributes` prop bag; mouse/pointer/touch handler params are native.
// - `clamp` comes from the ported stately number utils; `SliderState` from the ported
//   stately slider hook.
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import type {
	AriaLabelingProps,
	AriaValidationProps,
	DOMProps,
	FocusableDOMProps,
	InputDOMProps,
	LabelableProps,
	Orientation,
	RefObject,
	ValidationState,
} from '@react-types/shared';
// octane adaptation: FocusableProps is the ported native-event version.
import type { FocusableProps } from '../interactions/useFocusable';
import { clamp } from '../stately/utils/number';
import { focusWithoutScrolling } from '../utils/focusWithoutScrolling';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getSliderThumbId, sliderData } from './utils';
import { mergeProps } from '../utils/mergeProps';
import { useCallback, useEffect, useRef } from 'octane';
import type { SliderState } from '../stately/slider/useSliderState';
import { useFocusable } from '../interactions/useFocusable';
import { useFormReset } from '../utils/useFormReset';
import { useGlobalListeners } from '../utils/useGlobalListeners';
import { useKeyboard } from '../interactions/useKeyboard';
import { useLabel } from '../label/useLabel';
import { useLocale } from '../i18n/I18nProvider';
import { useMove } from '../interactions/useMove';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface SliderThumbProps extends FocusableProps, LabelableProps {
	/**
	 * The orientation of the Slider.
	 *
	 * @deprecated - pass to the slider instead.
	 * @default 'horizontal'
	 */
	orientation?: Orientation;
	/** Whether the Thumb is disabled. */
	isDisabled?: boolean;
	/**
	 * Index of the thumb within the slider.
	 *
	 * @default 0
	 */
	index?: number;
	/** @deprecated */
	isRequired?: boolean;
	/** @deprecated */
	isInvalid?: boolean;
	/** @deprecated */
	validationState?: ValidationState;
}

export interface AriaSliderThumbProps
	extends
		SliderThumbProps,
		DOMProps,
		Omit<FocusableDOMProps, 'excludeFromTabOrder'>,
		InputDOMProps,
		AriaLabelingProps,
		AriaValidationProps {}

export interface SliderThumbAria {
	/** Props for the root thumb element; handles the dragging motion. */
	thumbProps: DOMAttributes;

	/** Props for the visually hidden range input element. */
	inputProps: DOMAttributes;

	/** Props for the label element for this thumb (optional). */
	labelProps: DOMAttributes;

	/** Whether this thumb is currently being dragged. */
	isDragging: boolean;
	/** Whether the thumb is currently focused. */
	isFocused: boolean;
	/** Whether the thumb is disabled. */
	isDisabled: boolean;
}

export interface AriaSliderThumbOptions extends AriaSliderThumbProps {
	/** A ref to the track element. */
	trackRef: RefObject<Element | null>;
	/** A ref to the thumb input element. */
	inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * Provides behavior and accessibility for a thumb of a slider component.
 *
 * @param opts Options for this Slider thumb.
 * @param state Slider state, created via `useSliderState`.
 */
export function useSliderThumb(opts: AriaSliderThumbOptions, state: SliderState): SliderThumbAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSliderThumb(
	opts: AriaSliderThumbOptions,
	state: SliderState,
	slot: symbol | undefined,
): SliderThumbAria;
export function useSliderThumb(...args: any[]): SliderThumbAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSliderThumb');
	const opts = user[0] as AriaSliderThumbOptions;
	const state = user[1] as SliderState;

	let {
		index = 0,
		isRequired,
		validationState,
		isInvalid,
		trackRef,
		inputRef,
		orientation = state.orientation,
		name,
		form,
	} = opts;

	let isDisabled = opts.isDisabled || state.isDisabled;
	let isVertical = orientation === 'vertical';

	let { direction } = useLocale(subSlot(slot, 'locale'));
	let { addGlobalListener, removeGlobalListener } = useGlobalListeners(
		subSlot(slot, 'globalListeners'),
	);

	let data = sliderData.get(state)!;
	const { labelProps, fieldProps } = useLabel(
		{
			...opts,
			id: getSliderThumbId(state, index),
			'aria-labelledby': `${data.id} ${opts['aria-labelledby'] ?? ''}`.trim(),
		},
		subSlot(slot, 'label'),
	);

	const value = state.values[index];

	const focusInput = useCallback(
		() => {
			if (inputRef.current) {
				focusWithoutScrolling(inputRef.current);
			}
		},
		[inputRef],
		subSlot(slot, 'focusInput'),
	);

	const isFocused = state.focusedThumb === index;

	useEffect(
		() => {
			if (isFocused) {
				focusInput();
			}
		},
		[isFocused, focusInput],
		subSlot(slot, 'focusFx'),
	);

	let reverseX = direction === 'rtl';
	let currentPosition = useRef<number | null>(null, subSlot(slot, 'position'));

	let { keyboardProps } = useKeyboard(
		{
			onKeyDown(e) {
				let {
					getThumbMaxValue,
					getThumbMinValue,
					decrementThumb,
					incrementThumb,
					setThumbValue,
					setThumbDragging,
					pageSize,
				} = state;
				// these are the cases that useMove or useSlider don't handle
				if (!/^(PageUp|PageDown|Home|End)$/.test(e.key)) {
					e.continuePropagation();
					return;
				}
				// same handling as useMove, stopPropagation to prevent useSlider from handling the event as well.
				e.preventDefault();
				// remember to set this so that onChangeEnd is fired
				setThumbDragging(index, true);
				switch (e.key) {
					case 'PageUp':
						incrementThumb(index, pageSize);
						break;
					case 'PageDown':
						decrementThumb(index, pageSize);
						break;
					case 'Home':
						setThumbValue(index, getThumbMinValue(index));
						break;
					case 'End':
						setThumbValue(index, getThumbMaxValue(index));
						break;
				}
				setThumbDragging(index, false);
			},
		},
		subSlot(slot, 'keyboard'),
	);

	let { moveProps } = useMove(
		{
			onMoveStart() {
				currentPosition.current = null;
				state.setThumbDragging(index, true);
			},
			onMove({ deltaX, deltaY, pointerType, shiftKey }) {
				const { getThumbPercent, setThumbPercent, decrementThumb, incrementThumb, step, pageSize } =
					state;
				if (!trackRef.current) {
					return;
				}
				let { width, height } = trackRef.current.getBoundingClientRect();
				let size = isVertical ? height : width;

				if (currentPosition.current == null) {
					currentPosition.current = getThumbPercent(index) * size;
				}
				if (pointerType === 'keyboard') {
					if ((deltaX > 0 && reverseX) || (deltaX < 0 && !reverseX) || deltaY > 0) {
						decrementThumb(index, shiftKey ? pageSize : step);
					} else {
						incrementThumb(index, shiftKey ? pageSize : step);
					}
				} else {
					let delta = isVertical ? deltaY : deltaX;
					if (isVertical || reverseX) {
						delta = -delta;
					}

					currentPosition.current += delta;
					setThumbPercent(index, clamp(currentPosition.current / size, 0, 1));
				}
			},
			onMoveEnd() {
				state.setThumbDragging(index, false);
			},
		},
		subSlot(slot, 'move'),
	);

	// Immediately register editability with the state
	state.setThumbEditable(index, !isDisabled);

	const { focusableProps } = useFocusable(
		mergeProps(opts, {
			onFocus: () => state.setFocusedThumb(index),
			onBlur: () => state.setFocusedThumb(undefined),
		}),
		inputRef,
		subSlot(slot, 'focusable'),
	);

	let currentPointer = useRef<number | undefined>(undefined, subSlot(slot, 'pointer'));
	let onDown = (id?: number) => {
		focusInput();
		currentPointer.current = id;
		state.setThumbDragging(index, true);

		addGlobalListener(window, 'mouseup', onUp, false);
		addGlobalListener(window, 'touchend', onUp, false);
		addGlobalListener(window, 'pointerup', onUp, false);
	};

	let onUp = (e: any) => {
		let id = e.pointerId ?? e.changedTouches?.[0].identifier;
		if (id === currentPointer.current) {
			focusInput();
			state.setThumbDragging(index, false);
			removeGlobalListener(window, 'mouseup', onUp, false);
			removeGlobalListener(window, 'touchend', onUp, false);
			removeGlobalListener(window, 'pointerup', onUp, false);
		}
	};

	let thumbPosition = state.getThumbPercent(index);
	if (isVertical || direction === 'rtl') {
		thumbPosition = 1 - thumbPosition;
	}

	let interactions = !isDisabled
		? mergeProps(keyboardProps, moveProps, {
				onMouseDown: (e: MouseEvent) => {
					if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey) {
						return;
					}
					onDown();
				},
				onPointerDown: (e: PointerEvent) => {
					if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey) {
						return;
					}
					onDown(e.pointerId);
				},
				onTouchStart: (e: TouchEvent) => {
					onDown(e.changedTouches[0].identifier);
				},
			})
		: {};

	useFormReset(
		inputRef,
		state.defaultValues[index],
		(v) => {
			state.setThumbValue(index, v);
		},
		subSlot(slot, 'reset'),
	);

	// We install mouse handlers for the drag motion on the thumb div, but
	// not the key handler for moving the thumb with the slider.  Instead,
	// we focus the range input, and let the browser handle the keyboard
	// interactions; we then listen to input's native `input` event to update state.
	return {
		inputProps: mergeProps(focusableProps, fieldProps, {
			type: 'range',
			tabIndex: !isDisabled ? 0 : undefined,
			min: state.getThumbMinValue(index),
			max: state.getThumbMaxValue(index),
			step: state.step,
			value: value,
			name,
			form,
			disabled: isDisabled,
			'aria-orientation': orientation,
			'aria-valuetext': state.getThumbValueLabel(index),
			'aria-required': isRequired || undefined,
			'aria-invalid': isInvalid || validationState === 'invalid' || undefined,
			'aria-errormessage': opts['aria-errormessage'],
			'aria-describedby': [data['aria-describedby'], opts['aria-describedby']]
				.filter(Boolean)
				.join(' '),
			'aria-details': [data['aria-details'], opts['aria-details']].filter(Boolean).join(' '),
			// octane adaptation: React's synthetic onChange for range inputs rides the
			// native `input` event — onInput is the direct equivalent.
			onInput: (e: Event) => {
				state.setThumbValue(index, parseFloat((getEventTarget(e) as HTMLInputElement).value));
			},
		}),
		thumbProps: {
			...interactions,
			style: {
				position: 'absolute',
				[isVertical ? 'top' : 'left']: `${thumbPosition * 100}%`,
				transform: 'translate(-50%, -50%)',
				touchAction: 'none',
			},
		},
		labelProps,
		isDragging: state.isThumbDragging(index),
		isDisabled,
		isFocused,
	};
}
