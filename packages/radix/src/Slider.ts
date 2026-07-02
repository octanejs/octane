// Ported from @radix-ui/react-slider (source:
// .radix-primitives/packages/react/slider/src/slider.tsx). A multi-thumb slider:
// Root owns the sorted values array (controllable) + keyboard/pointer update logic;
// Horizontal/Vertical orientation layers translate pointer positions and step keys;
// Impl owns pointer capture + slide events; Track/Range/Thumb render the parts (thumb
// positions are percentage-based with an in-bounds offset). Each Thumb renders a
// hidden native input "bubble input" inside forms (value synced via the native
// `value` setter + a dispatched bubbling `input` event — octane's native `<form
// onInput>` observes it directly, so no extra adaptation is needed here).
import { createElement, useEffect, useMemo, useRef, useState } from 'octane';

import { createCollection } from './collection';
import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import { usePrevious } from './use-previous';
import { useSize } from './use-size';
import { useControllableState } from './useControllableState';

type Direction = 'ltr' | 'rtl';

const PAGE_KEYS = ['PageUp', 'PageDown'];
const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

type SlideDirection = 'from-left' | 'from-right' | 'from-bottom' | 'from-top';
const BACK_KEYS: Record<SlideDirection, string[]> = {
	'from-left': ['Home', 'PageDown', 'ArrowDown', 'ArrowLeft'],
	'from-right': ['Home', 'PageDown', 'ArrowDown', 'ArrowRight'],
	'from-bottom': ['Home', 'PageDown', 'ArrowDown', 'ArrowLeft'],
	'from-top': ['Home', 'PageDown', 'ArrowUp', 'ArrowLeft'],
};

const SLIDER_NAME = 'Slider';

const [Collection, useCollection, createCollectionScope] = createCollection(SLIDER_NAME);

const [createSliderContext, createSliderScope] = createContextScope(SLIDER_NAME, [
	createCollectionScope,
]);
export { createSliderScope };

interface SliderContextValue {
	name: string | undefined;
	disabled: boolean | undefined;
	min: number;
	max: number;
	values: number[];
	valueIndexToChangeRef: { current: number };
	thumbs: Set<HTMLElement>;
	orientation: 'horizontal' | 'vertical' | undefined;
	form: string | undefined;
}

const [SliderProvider, useSliderContext] = createSliderContext<SliderContextValue>(SLIDER_NAME);

export function Root(props: any): any {
	const slot = S('Slider.Root');
	const {
		__scopeSlider,
		name,
		min = 0,
		max = 100,
		step = 1,
		orientation = 'horizontal',
		disabled = false,
		minStepsBetweenThumbs = 0,
		defaultValue = [min],
		value,
		onValueChange = () => {},
		onValueCommit = () => {},
		inverted = false,
		form,
		ref: forwardedRef,
		...sliderProps
	} = props ?? {};
	const thumbRefs = useRef<Set<HTMLElement>>(new Set(), subSlot(slot, 'thumbs'));
	const valueIndexToChangeRef = useRef<number>(0, subSlot(slot, 'index'));
	const isKeyboardInteractionRef = useRef(false, subSlot(slot, 'keyboard'));
	const isHorizontal = orientation === 'horizontal';
	const SliderOrientation = isHorizontal ? SliderHorizontal : SliderVertical;

	const [valuesState, setValues] = useControllableState<number[]>(
		{
			prop: value,
			defaultProp: defaultValue,
			onChange: (value: number[]) => {
				const thumbs = [...thumbRefs.current];
				thumbs[valueIndexToChangeRef.current]?.focus({
					preventScroll: true,
					focusVisible: isKeyboardInteractionRef.current,
				} as FocusOptions);
				isKeyboardInteractionRef.current = false;
				onValueChange(value);
			},
		},
		subSlot(slot, 'values'),
	);
	const values = valuesState ?? [];
	const valuesBeforeSlideStartRef = useRef(values, subSlot(slot, 'before'));

	function handleSlideStart(value: number): void {
		const closestIndex = getClosestValueIndex(values, value);
		updateValues(value, closestIndex);
	}

	function handleSlideMove(value: number): void {
		updateValues(value, valueIndexToChangeRef.current);
	}

	function handleSlideEnd(): void {
		const prevValue = valuesBeforeSlideStartRef.current[valueIndexToChangeRef.current];
		const nextValue = values[valueIndexToChangeRef.current];
		const hasChanged = nextValue !== prevValue;
		if (hasChanged) onValueCommit(values);
	}

	function updateValues(value: number, atIndex: number, { commit } = { commit: false }): void {
		const decimalCount = getDecimalCount(step);
		const snapToStep = roundValue(Math.round((value - min) / step) * step + min, decimalCount);
		const nextValue = clamp(snapToStep, [min, max]);

		setValues((prevValues = []) => {
			const nextValues = getNextSortedValues(prevValues, nextValue, atIndex);
			if (hasMinStepsBetweenValues(nextValues, minStepsBetweenThumbs * step)) {
				valueIndexToChangeRef.current = nextValues.indexOf(nextValue);
				const hasChanged = String(nextValues) !== String(prevValues);
				if (hasChanged && commit) onValueCommit(nextValues);
				return hasChanged ? nextValues : prevValues;
			} else {
				return prevValues;
			}
		});
	}

	return createElement(SliderProvider, {
		scope: __scopeSlider,
		name,
		disabled,
		min,
		max,
		valueIndexToChangeRef,
		thumbs: thumbRefs.current,
		values,
		orientation,
		form,
		children: createElement(Collection.Provider, {
			scope: __scopeSlider,
			children: createElement(Collection.Slot, {
				scope: __scopeSlider,
				children: createElement(SliderOrientation, {
					'aria-disabled': disabled,
					'data-disabled': disabled ? '' : undefined,
					...sliderProps,
					__scopeSlider,
					ref: forwardedRef,
					onPointerDown: composeEventHandlers(sliderProps.onPointerDown, () => {
						if (!disabled) {
							valuesBeforeSlideStartRef.current = values;
							isKeyboardInteractionRef.current = false;
						}
					}),
					min,
					max,
					inverted,
					onSlideStart: disabled ? undefined : handleSlideStart,
					onSlideMove: disabled ? undefined : handleSlideMove,
					onSlideEnd: disabled ? undefined : handleSlideEnd,
					onHomeKeyDown: () => {
						if (!disabled) {
							isKeyboardInteractionRef.current = true;
							updateValues(min, 0, { commit: true });
						}
					},
					onEndKeyDown: () => {
						if (!disabled) {
							isKeyboardInteractionRef.current = true;
							updateValues(max, values.length - 1, { commit: true });
						}
					},
					onStepKeyDown: ({
						event,
						direction: stepDirection,
					}: {
						event: KeyboardEvent;
						direction: number;
					}) => {
						if (!disabled) {
							isKeyboardInteractionRef.current = true;
							const isPageKey = PAGE_KEYS.includes(event.key);
							const isSkipKey = isPageKey || (event.shiftKey && ARROW_KEYS.includes(event.key));
							const multiplier = isSkipKey ? 10 : 1;
							const atIndex = valueIndexToChangeRef.current;
							const value = values[atIndex]!;
							const stepInDirection = step * multiplier * stepDirection;
							updateValues(value + stepInDirection, atIndex, { commit: true });
						}
					},
				}),
			}),
		}),
	});
}

const [SliderOrientationProvider, useSliderOrientationContext] = createSliderContext<{
	startEdge: 'top' | 'right' | 'bottom' | 'left';
	endEdge: 'top' | 'right' | 'bottom' | 'left';
	size: 'width' | 'height';
	direction: number;
}>(SLIDER_NAME, {
	startEdge: 'left',
	endEdge: 'right',
	size: 'width',
	direction: 1,
});

function SliderHorizontal(props: any): any {
	const slot = S('Slider.Horizontal');
	const {
		min,
		max,
		dir,
		inverted,
		onSlideStart,
		onSlideMove,
		onSlideEnd,
		onStepKeyDown,
		ref: forwardedRef,
		...sliderProps
	} = props;
	const [slider, setSlider] = useState<HTMLElement | null>(null, subSlot(slot, 'slider'));
	const composedRefs = useComposedRefs(forwardedRef, setSlider, subSlot(slot, 'refs'));
	const rectRef = useRef<DOMRect | undefined>(undefined, subSlot(slot, 'rect'));
	const direction = useDirection(dir);
	const isDirectionLTR = direction === 'ltr';
	const isSlidingFromLeft = (isDirectionLTR && !inverted) || (!isDirectionLTR && inverted);

	function getValueFromPointer(pointerPosition: number): number {
		const rect = rectRef.current || slider!.getBoundingClientRect();
		const input: [number, number] = [0, rect.width];
		const output: [number, number] = isSlidingFromLeft ? [min, max] : [max, min];
		const value = linearScale(input, output);

		rectRef.current = rect;
		return value(pointerPosition - rect.left);
	}

	return createElement(SliderOrientationProvider, {
		scope: props.__scopeSlider,
		startEdge: isSlidingFromLeft ? 'left' : 'right',
		endEdge: isSlidingFromLeft ? 'right' : 'left',
		direction: isSlidingFromLeft ? 1 : -1,
		size: 'width',
		children: createElement(SliderImpl, {
			dir: direction,
			'data-orientation': 'horizontal',
			...sliderProps,
			ref: composedRefs,
			style: {
				...sliderProps.style,
				'--radix-slider-thumb-transform': 'translateX(-50%)',
			},
			onSlideStart: (event: PointerEvent) => {
				const value = getValueFromPointer(event.clientX);
				onSlideStart?.(value);
			},
			onSlideMove: (event: PointerEvent) => {
				const value = getValueFromPointer(event.clientX);
				onSlideMove?.(value);
			},
			onSlideEnd: () => {
				rectRef.current = undefined;
				onSlideEnd?.();
			},
			onStepKeyDown: (event: KeyboardEvent) => {
				const slideDirection = isSlidingFromLeft ? 'from-left' : 'from-right';
				const isBackKey = BACK_KEYS[slideDirection].includes(event.key);
				onStepKeyDown?.({ event, direction: isBackKey ? -1 : 1 });
			},
		}),
	});
}

function SliderVertical(props: any): any {
	const slot = S('Slider.Vertical');
	const {
		min,
		max,
		inverted,
		onSlideStart,
		onSlideMove,
		onSlideEnd,
		onStepKeyDown,
		ref: forwardedRef,
		...sliderProps
	} = props;
	const sliderRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const ref = useComposedRefs(forwardedRef, sliderRef, subSlot(slot, 'refs'));
	const rectRef = useRef<DOMRect | undefined>(undefined, subSlot(slot, 'rect'));
	const isSlidingFromBottom = !inverted;

	function getValueFromPointer(pointerPosition: number): number {
		const rect = rectRef.current || (sliderRef.current as HTMLElement).getBoundingClientRect();
		const input: [number, number] = [0, rect.height];
		const output: [number, number] = isSlidingFromBottom ? [max, min] : [min, max];
		const value = linearScale(input, output);

		rectRef.current = rect;
		return value(pointerPosition - rect.top);
	}

	return createElement(SliderOrientationProvider, {
		scope: props.__scopeSlider,
		startEdge: isSlidingFromBottom ? 'bottom' : 'top',
		endEdge: isSlidingFromBottom ? 'top' : 'bottom',
		size: 'height',
		direction: isSlidingFromBottom ? 1 : -1,
		children: createElement(SliderImpl, {
			'data-orientation': 'vertical',
			...sliderProps,
			ref,
			style: {
				...sliderProps.style,
				'--radix-slider-thumb-transform': 'translateY(50%)',
			},
			onSlideStart: (event: PointerEvent) => {
				const value = getValueFromPointer(event.clientY);
				onSlideStart?.(value);
			},
			onSlideMove: (event: PointerEvent) => {
				const value = getValueFromPointer(event.clientY);
				onSlideMove?.(value);
			},
			onSlideEnd: () => {
				rectRef.current = undefined;
				onSlideEnd?.();
			},
			onStepKeyDown: (event: KeyboardEvent) => {
				const slideDirection = isSlidingFromBottom ? 'from-bottom' : 'from-top';
				const isBackKey = BACK_KEYS[slideDirection].includes(event.key);
				onStepKeyDown?.({ event, direction: isBackKey ? -1 : 1 });
			},
		}),
	});
}

function SliderImpl(props: any): any {
	const {
		__scopeSlider,
		onSlideStart,
		onSlideMove,
		onSlideEnd,
		onHomeKeyDown,
		onEndKeyDown,
		onStepKeyDown,
		ref: forwardedRef,
		...sliderProps
	} = props;
	const context = useSliderContext(SLIDER_NAME, __scopeSlider);

	return createElement(Primitive.span, {
		...sliderProps,
		ref: forwardedRef,
		onKeyDown: composeEventHandlers(props.onKeyDown, (event: KeyboardEvent) => {
			if (event.key === 'Home') {
				onHomeKeyDown(event);
				// Prevent scrolling to page start
				event.preventDefault();
			} else if (event.key === 'End') {
				onEndKeyDown(event);
				// Prevent scrolling to page end
				event.preventDefault();
			} else if (PAGE_KEYS.concat(ARROW_KEYS).includes(event.key)) {
				onStepKeyDown(event);
				// Prevent scrolling for directional key presses
				event.preventDefault();
			}
		}),
		onPointerDown: composeEventHandlers(props.onPointerDown, (event: PointerEvent) => {
			const target = event.target as HTMLElement;
			target.setPointerCapture(event.pointerId);
			// Prevent browser focus behaviour because we focus a thumb manually when values change.
			event.preventDefault();
			// Touch devices have a delay before focusing so won't focus if touch immediately moves
			// away from target (sliding). We want thumb to focus regardless.
			if (context.thumbs.has(target)) {
				// Pointer interaction, so avoid showing the focus ring (`:focus-visible`).
				target.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
			} else {
				onSlideStart(event);
			}
		}),
		onPointerMove: composeEventHandlers(props.onPointerMove, (event: PointerEvent) => {
			const target = event.target as HTMLElement;
			if (target.hasPointerCapture(event.pointerId)) onSlideMove(event);
		}),
		onPointerUp: composeEventHandlers(props.onPointerUp, (event: PointerEvent) => {
			const target = event.target as HTMLElement;
			if (target.hasPointerCapture(event.pointerId)) {
				target.releasePointerCapture(event.pointerId);
				onSlideEnd(event);
			}
		}),
	});
}

export function Track(props: any): any {
	const { __scopeSlider, ...trackProps } = props ?? {};
	const context = useSliderContext('SliderTrack', __scopeSlider);
	return createElement(Primitive.span, {
		'data-disabled': context.disabled ? '' : undefined,
		'data-orientation': context.orientation,
		...trackProps,
	});
}

export function Range(props: any): any {
	const slot = S('Slider.Range');
	const { __scopeSlider, ref: forwardedRef, ...rangeProps } = props ?? {};
	const context = useSliderContext('SliderRange', __scopeSlider);
	const orientation = useSliderOrientationContext('SliderRange', __scopeSlider);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const valuesCount = context.values.length;
	const percentages = context.values.map((value: number) =>
		convertValueToPercentage(value, context.min, context.max),
	);
	const offsetStart = valuesCount > 1 ? Math.min(...percentages) : 0;
	const offsetEnd = 100 - Math.max(...percentages);

	return createElement(Primitive.span, {
		'data-orientation': context.orientation,
		'data-disabled': context.disabled ? '' : undefined,
		...rangeProps,
		ref: composedRefs,
		style: {
			...props?.style,
			[orientation.startEdge]: offsetStart + '%',
			[orientation.endEdge]: offsetEnd + '%',
		},
	});
}

const THUMB_NAME = 'SliderThumb';

interface SliderThumbContextValue {
	value: number | undefined;
	name: string | undefined;
	form: string | undefined;
	isFormControl: boolean;
	index: number;
	thumb: HTMLElement | null;
	onThumbChange(thumb: HTMLElement | null): void;
	percent: number;
	size: { width: number; height: number } | undefined;
}

const [SliderThumbContextProvider, useSliderThumbContext] =
	createSliderContext<SliderThumbContextValue>(THUMB_NAME);

function ThumbProvider(props: any): any {
	const slot = S('Slider.ThumbProvider');
	const { __scopeSlider, name, children, internal_do_not_use_render } = props;
	const context = useSliderContext('SliderThumbProvider', __scopeSlider);
	const getItems = useCollection(__scopeSlider, subSlot(slot, 'items'));
	const [thumb, setThumb] = useState<HTMLElement | null>(null, subSlot(slot, 'thumb'));
	const index = useMemo(
		() => (thumb ? getItems().findIndex((item: any) => item.ref.current === thumb) : -1),
		[getItems, thumb],
		subSlot(slot, 'index'),
	);
	const size = useSize(thumb, subSlot(slot, 'size'));
	// We set this to true by default so that events bubble to forms without JS (SSR)
	const isFormControl = thumb ? !!context.form || !!thumb.closest('form') : true;
	// We cast because index could be `-1` which would return undefined
	const value = context.values[index] as number | undefined;
	const resolvedName =
		name ?? (context.name ? context.name + (context.values.length > 1 ? '[]' : '') : undefined);
	const percent =
		value === undefined ? 0 : convertValueToPercentage(value, context.min, context.max);

	useEffect(
		() => {
			if (thumb) {
				context.thumbs.add(thumb);
				return () => {
					context.thumbs.delete(thumb);
				};
			}
		},
		[thumb, context.thumbs],
		subSlot(slot, 'e:thumb'),
	);

	const thumbContext: SliderThumbContextValue = {
		value,
		name: resolvedName,
		form: context.form,
		isFormControl,
		index,
		thumb,
		onThumbChange: setThumb,
		percent,
		size,
	};

	return createElement(SliderThumbContextProvider, {
		scope: __scopeSlider,
		...thumbContext,
		children: isFunction(internal_do_not_use_render)
			? internal_do_not_use_render(thumbContext)
			: children,
	});
}

function ThumbTrigger(props: any): any {
	const slot = S('Slider.ThumbTrigger');
	const { __scopeSlider, ref: forwardedRef, ...thumbProps } = props;
	const context = useSliderContext('SliderThumbTrigger', __scopeSlider);
	const orientation = useSliderOrientationContext('SliderThumbTrigger', __scopeSlider);
	const { index, value, percent, size, onThumbChange } = useSliderThumbContext(
		'SliderThumbTrigger',
		__scopeSlider,
	);
	const composedRefs = useComposedRefs(forwardedRef, onThumbChange, subSlot(slot, 'refs'));
	const label = getLabel(index, context.values.length);
	const orientationSize = size?.[orientation.size];
	const thumbInBoundsOffset = orientationSize
		? getThumbInBoundsOffset(orientationSize, percent, orientation.direction)
		: 0;

	return createElement('span', {
		style: {
			transform: 'var(--radix-slider-thumb-transform)',
			position: 'absolute',
			[orientation.startEdge]: `calc(${percent}% + ${thumbInBoundsOffset}px)`,
		},
		children: createElement(Collection.ItemSlot, {
			scope: __scopeSlider,
			children: createElement(Primitive.span, {
				role: 'slider',
				'aria-label': props['aria-label'] || label,
				'aria-valuemin': context.min,
				'aria-valuenow': value,
				'aria-valuemax': context.max,
				'aria-orientation': context.orientation,
				'data-orientation': context.orientation,
				'data-disabled': context.disabled ? '' : undefined,
				tabIndex: context.disabled ? undefined : 0,
				...thumbProps,
				ref: composedRefs,
				// There will be no value on initial render while we work out the index so
				// we hide thumbs without a value; otherwise SSR would render them in the
				// wrong position before they snap into place during hydration.
				style: value === undefined ? { display: 'none' } : props.style,
				onFocus: composeEventHandlers(props.onFocus, () => {
					context.valueIndexToChangeRef.current = index;
				}),
			}),
		}),
	});
}

export function Thumb(props: any): any {
	const { __scopeSlider, name, ref: forwardedRef, ...thumbProps } = props ?? {};
	return createElement(ThumbProvider, {
		__scopeSlider,
		name,
		internal_do_not_use_render: ({ index, isFormControl }: SliderThumbContextValue) => [
			createElement(ThumbTrigger, {
				key: 'trigger',
				...thumbProps,
				ref: forwardedRef,
				__scopeSlider,
			}),
			isFormControl ? createElement(BubbleInput, { key: 'bubble-' + index, __scopeSlider }) : null,
		],
	});
}

export function BubbleInput(props: any): any {
	const slot = S('Slider.BubbleInput');
	const { __scopeSlider, ref: forwardedRef, ...inputProps } = props ?? {};
	const { value, name, form } = useSliderThumbContext('SliderBubbleInput', __scopeSlider);
	const ref = useRef<HTMLInputElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(ref, forwardedRef, subSlot(slot, 'refs'));
	const prevValue = usePrevious(value, subSlot(slot, 'prev'));

	// Bubble value change to parents (e.g form change event)
	useEffect(
		() => {
			const input = ref.current;
			if (!input) return;

			const inputProto = window.HTMLInputElement.prototype;
			const descriptor = Object.getOwnPropertyDescriptor(inputProto, 'value') as PropertyDescriptor;
			const setValue = descriptor.set;
			if (prevValue !== value && setValue) {
				const event = new Event('input', { bubbles: true });
				setValue.call(input, value);
				input.dispatchEvent(event);
			}
		},
		[prevValue, value],
		subSlot(slot, 'e:bubble'),
	);

	// We purposefully do not use `type="hidden"` here otherwise forms that wrap it
	// will not be able to access its value via the FormData API.
	//
	// octane: the source omits React's `value` prop (its controlled model would
	// swallow the programmatic dispatch) and uses `defaultValue`; the octane
	// equivalent of default-value semantics is the native `value` ATTRIBUTE, which
	// the property setter above never touches.
	return createElement(Primitive.input, {
		style: { display: 'none' },
		name,
		form,
		...inputProps,
		ref: composedRefs,
		value,
	});
}

function getNextSortedValues(prevValues: number[] = [], nextValue: number, atIndex: number) {
	const nextValues = [...prevValues];
	nextValues[atIndex] = nextValue;
	return nextValues.sort((a, b) => a - b);
}

function convertValueToPercentage(value: number, min: number, max: number): number {
	const maxSteps = max - min;
	const percentPerStep = 100 / maxSteps;
	const percentage = percentPerStep * (value - min);
	return clamp(percentage, [0, 100]);
}

/**
 * Returns a label for each thumb when there are two or more thumbs
 */
function getLabel(index: number, totalValues: number): string | undefined {
	if (totalValues > 2) {
		return `Value ${index + 1} of ${totalValues}`;
	} else if (totalValues === 2) {
		return ['Minimum', 'Maximum'][index];
	} else {
		return undefined;
	}
}

/**
 * Given a `values` array and a `nextValue`, determine which value in
 * the array is closest to `nextValue` and return its index.
 */
function getClosestValueIndex(values: number[], nextValue: number): number {
	if (values.length === 1) return 0;
	const distances = values.map((value) => Math.abs(value - nextValue));
	const closestDistance = Math.min(...distances);
	return distances.indexOf(closestDistance);
}

/**
 * Offsets the thumb centre point while sliding to ensure it remains
 * within the bounds of the slider when reaching the edges
 */
function getThumbInBoundsOffset(width: number, left: number, direction: number): number {
	const halfWidth = width / 2;
	const halfPercent = 50;
	const offset = linearScale([0, halfPercent], [0, halfWidth]);
	return (halfWidth - offset(left) * direction) * direction;
}

/**
 * Gets an array of steps between each value.
 */
function getStepsBetweenValues(values: number[]): number[] {
	return values.slice(0, -1).map((value, index) => values[index + 1]! - value);
}

/**
 * Verifies the minimum steps between all values is greater than or equal
 * to the expected minimum steps.
 */
function hasMinStepsBetweenValues(values: number[], minStepsBetweenValues: number): boolean {
	if (minStepsBetweenValues > 0) {
		const stepsBetweenValues = getStepsBetweenValues(values);
		const actualMinStepsBetweenValues = Math.min(...stepsBetweenValues);
		return actualMinStepsBetweenValues >= minStepsBetweenValues;
	}
	return true;
}

// https://github.com/tmcw-up-for-adoption/simple-linear-scale/blob/master/index.js
function linearScale(input: readonly [number, number], output: readonly [number, number]) {
	return (value: number) => {
		if (input[0] === input[1] || output[0] === output[1]) return output[0];
		const ratio = (output[1] - output[0]) / (input[1] - input[0]);
		return output[0] + ratio * (value - input[0]);
	};
}

function getDecimalCount(value: number): number {
	if (!Number.isFinite(value)) return 0;

	const str = value.toString();

	// Numbers with a magnitude below 1e-6 (or very large numbers) are serialized
	// in scientific notation (e.g. `1e-7`), so we can't just count the digits
	// after the decimal point (radix#3852).
	if (str.includes('e')) {
		const [coefficient, exponent] = str.split('e');
		const decimalPart = coefficient!.split('.')[1] || '';
		const exponentNum = Number(exponent);
		return Math.max(0, decimalPart.length - exponentNum);
	}

	const decimalPart = str.split('.')[1];
	return decimalPart ? decimalPart.length : 0;
}

function roundValue(value: number, decimalCount: number): number {
	const rounder = Math.pow(10, decimalCount);
	return Math.round(value * rounder) / rounder;
}

// @radix-ui/number's clamp, inlined (its only export).
function clamp(value: number, [min, max]: [number, number]): number {
	return Math.min(max, Math.max(min, value));
}

function isFunction(value: unknown): value is (...args: any[]) => any {
	return typeof value === 'function';
}

export {
	Root as Slider,
	Track as SliderTrack,
	Range as SliderRange,
	Thumb as SliderThumb,
	ThumbProvider as SliderThumbProvider,
	ThumbTrigger as SliderThumbTrigger,
	BubbleInput as SliderBubbleInput,
};
