// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Slider.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref (SliderThumb has no context and reads `props.ref` directly); the plain-`.ts` components
// use the S()/subSlot component-slot convention; `clamp` comes from the binding's stately
// utils port; React's HTMLAttributes/OutputHTMLAttributes prop bags → structural records.
// The thumb's hidden `<input type="range">` keeps upstream's native wiring (position math
// reads track rects, which are inert in jsdom — tests assert aria/data-* wiring, not pixels).
import type { HoverEvents, Orientation, RefObject } from '@react-types/shared';
import { createContext, createElement, useContext, useRef } from 'octane';

import { useFocusRing } from '../focus/useFocusRing';
import { useNumberFormatter } from '../i18n/useNumberFormatter';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { type AriaSliderProps, useSlider } from '../slider/useSlider';
import { type AriaSliderThumbProps, useSliderThumb } from '../slider/useSliderThumb';
import { type SliderState, useSliderState } from '../stately/slider/useSliderState';
import { clamp } from '../stately/utils/number';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { VisuallyHidden } from '../visually-hidden/VisuallyHidden';
import { LabelContext } from './Label';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	Provider,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
	useSlot,
	useSlottedContext,
} from './utils';

// octane adaptations: structural bags (upstream's React attribute/handler types).
type GlobalDOMAttributes = Record<string, any>;
type HTMLAttributes = Record<string, any>;
type OutputHTMLAttributes = Record<string, any>;

export interface SliderProps<T = number | number[]>
	extends
		Omit<AriaSliderProps<T>, 'label'>,
		RenderProps<SliderRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Slider'
	 */
	className?: ClassNameOrFunction<SliderRenderProps>;
	/**
	 * The display format of the value label.
	 */
	formatOptions?: Intl.NumberFormatOptions;
}

export const SliderContext = createContext<ContextValue<SliderProps, HTMLDivElement>>(null);
export const SliderStateContext = createContext<SliderState | null>(null);
export const SliderTrackContext =
	createContext<ContextValue<SliderTrackContextValue, HTMLDivElement>>(null);
export const SliderFillContext = createContext<ContextValue<SliderFillProps, HTMLDivElement>>(null);
export const SliderOutputContext =
	createContext<ContextValue<SliderOutputContextValue, HTMLOutputElement>>(null);

export interface SliderRenderProps {
	/**
	 * The orientation of the slider.
	 *
	 * @selector [data-orientation="horizontal | vertical"]
	 */
	orientation: Orientation;
	/**
	 * Whether the slider is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * State of the slider.
	 */
	state: SliderState;
}

/**
 * A slider allows a user to select one or more values within a range.
 */
export function Slider<T extends number | number[]>(props: SliderProps<T>): any {
	const slot = S('Slider');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, SliderContext, subSlot(slot, 'ctx'));
	let trackRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'track'));
	let numberFormatter = useNumberFormatter(props.formatOptions, subSlot(slot, 'formatter'));
	let state = useSliderState({ ...props, numberFormatter }, subSlot(slot, 'state'));
	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let { groupProps, trackProps, labelProps, outputProps } = useSlider(
		{ ...props, label },
		state,
		trackRef,
		subSlot(slot, 'slider'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			values: {
				orientation: state.orientation,
				isDisabled: state.isDisabled,
				state,
			},
			defaultClassName: 'react-aria-Slider',
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	return createElement(Provider, {
		values: [
			[SliderStateContext, state],
			[SliderTrackContext, { ...trackProps, ref: trackRef }],
			[SliderOutputContext, outputProps],
			[LabelContext, { ...labelProps, ref: labelRef }],
		] as any,
		children: createElement(dom.div, {
			...mergeProps(DOMProps, renderProps, groupProps),
			ref,
			slot: props.slot || undefined,
			'data-orientation': state.orientation,
			'data-disabled': state.isDisabled || undefined,
		}),
	});
}

export interface SliderOutputProps
	extends RenderProps<SliderRenderProps, 'output'>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SliderOutput'
	 */
	className?: ClassNameOrFunction<SliderRenderProps>;
}
interface SliderOutputContextValue
	extends Omit<OutputHTMLAttributes, 'children' | 'className' | 'style'>, SliderOutputProps {}

/**
 * A slider output displays the current value of a slider as text.
 */
export function SliderOutput(props: SliderOutputProps): any {
	const slot = S('SliderOutput');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, SliderOutputContext, subSlot(slot, 'ctx'));
	let { children, style, className, render, ...otherProps } = props;
	let state = useContext(SliderStateContext)!;
	let renderProps = useRenderProps(
		{
			className,
			style,
			children,
			render,
			defaultChildren: state.getFormattedValue(),
			defaultClassName: 'react-aria-SliderOutput',
			values: {
				orientation: state.orientation,
				isDisabled: state.isDisabled,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	return createElement(dom.output, {
		...otherProps,
		...renderProps,
		ref,
		'data-orientation': state.orientation || undefined,
		'data-disabled': state.isDisabled || undefined,
	});
}

export interface SliderTrackRenderProps extends SliderRenderProps {
	/**
	 * Whether the slider track is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
}

export interface SliderTrackProps
	extends HoverEvents, RenderProps<SliderTrackRenderProps>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SliderTrack'
	 */
	className?: ClassNameOrFunction<SliderTrackRenderProps>;
}
interface SliderTrackContextValue
	extends Omit<HTMLAttributes, 'children' | 'className' | 'style'>, SliderTrackProps {}

/**
 * A slider track is a container for one or more slider thumbs.
 */
export function SliderTrack(props: SliderTrackProps): any {
	const slot = S('SliderTrack');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, SliderTrackContext, subSlot(slot, 'ctx'));
	let state = useContext(SliderStateContext)!;
	let { onHoverStart, onHoverEnd, onHoverChange, ...otherProps } = props;
	let { hoverProps, isHovered } = useHover(
		{ onHoverStart, onHoverEnd, onHoverChange },
		subSlot(slot, 'hover'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-SliderTrack',
			values: {
				orientation: state.orientation,
				isDisabled: state.isDisabled,
				isHovered,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	return createElement(dom.div, {
		...mergeProps(otherProps, hoverProps),
		...renderProps,
		ref,
		'data-hovered': isHovered || undefined,
		'data-orientation': state.orientation || undefined,
		'data-disabled': state.isDisabled || undefined,
	});
}

export interface SliderThumbRenderProps {
	/**
	 * State of the slider.
	 */
	state: SliderState;
	/**
	 * Whether this thumb is currently being dragged.
	 *
	 * @selector [data-dragging]
	 */
	isDragging: boolean;
	/**
	 * Whether the thumb is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the thumb is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the thumb is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the thumb is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
}

export interface SliderThumbProps
	extends
		Omit<AriaSliderThumbProps, 'label' | 'validationState'>,
		HoverEvents,
		RenderProps<SliderThumbRenderProps>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SliderThumb'
	 */
	className?: ClassNameOrFunction<SliderThumbRenderProps>;
	/**
	 * A ref for the HTML input element.
	 */
	inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * A slider thumb represents an individual value that the user can adjust within a slider track.
 */
export function SliderThumb(props: SliderThumbProps): any {
	const slot = S('SliderThumb');
	// No thumb context upstream — the forwarded ref is read straight off props.
	let ref = (props as any).ref;
	let { inputRef: userInputRef = null } = props;
	let state = useContext(SliderStateContext)!;
	let { ref: trackRef } = useSlottedContext(SliderTrackContext)!;
	let { index = 0 } = props;
	let defaultInputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'input'));
	let inputRef = userInputRef || defaultInputRef;
	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let { thumbProps, inputProps, labelProps, isDragging, isFocused, isDisabled } = useSliderThumb(
		{
			...props,
			index,
			trackRef: trackRef as RefObject<HTMLDivElement | null>,
			inputRef,
			label,
		},
		state,
		subSlot(slot, 'thumb'),
	);

	let { focusProps, isFocusVisible } = useFocusRing(undefined, subSlot(slot, 'focusRing'));
	let { hoverProps, isHovered } = useHover(props, subSlot(slot, 'hover'));

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-SliderThumb',
			values: {
				state,
				isHovered,
				isDragging,
				isFocused,
				isFocusVisible,
				isDisabled,
			},
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	return createElement(dom.div, {
		...mergeProps(DOMProps, thumbProps, hoverProps),
		...renderProps,
		ref,
		style: { ...thumbProps.style, ...renderProps.style },
		'data-hovered': isHovered || undefined,
		'data-dragging': isDragging || undefined,
		'data-focused': isFocused || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		'data-disabled': isDisabled || undefined,
		// octane adaptation: keys keep the two-item child array (hidden input +
		// provider-wrapped children) reconciling stably (upstream renders JSX siblings).
		children: [
			createElement(VisuallyHidden, {
				key: 'input',
				children: createElement('input', {
					ref: inputRef,
					...mergeProps(inputProps, focusProps),
				}),
			}),
			createElement(Provider, {
				key: 'children',
				values: [[LabelContext, { ...labelProps, ref: labelRef }]] as any,
				children: renderProps.children,
			}),
		],
	});
}

export interface SliderFillRenderProps extends SliderRenderProps {
	/**
	 * Whether the slider fill is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
}

export interface SliderFillProps
	extends HoverEvents, RenderProps<SliderFillRenderProps>, GlobalDOMAttributes {
	/**
	 * The offset from which to start the fill.
	 *
	 * @default 0
	 */
	offset?: number;
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SliderFill'
	 */
	className?: ClassNameOrFunction<SliderFillRenderProps>;
}

/**
 * Displays the selected range.
 */
export function SliderFill(props: SliderFillProps): any {
	const slot = S('SliderFill');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, SliderFillContext, subSlot(slot, 'ctx'));
	let state = useContext(SliderStateContext)!;
	let { onHoverStart, onHoverEnd, onHoverChange, ...otherProps } = props;
	let { hoverProps, isHovered } = useHover(
		{ onHoverStart, onHoverEnd, onHoverChange },
		subSlot(slot, 'hover'),
	);

	let offset =
		props.offset != null
			? clamp(props.offset, state.getThumbMinValue(0), state.getThumbMaxValue(0))
			: state.getThumbMinValue(0);
	let start =
		state.values.length > 1 ? state.getThumbPercent(0) * 100 : state.getValuePercent(offset) * 100;
	let end = state.values.length > 0 ? state.getThumbPercent(state.values.length - 1) * 100 : 0;
	let startPercent = Math.min(start, end);
	let endPercent = Math.max(start, end);
	let sizePercent = Math.max(0, endPercent - startPercent);

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-SliderFill',
			defaultStyle:
				state.orientation === 'vertical'
					? {
							position: 'absolute',
							bottom: `${startPercent}%`,
							height: `${sizePercent}%`,
							width: '100%',
						}
					: {
							position: 'absolute',
							insetInlineStart: `${startPercent}%`,
							width: `${sizePercent}%`,
							height: '100%',
						},
			values: {
				orientation: state.orientation,
				isDisabled: state.isDisabled,
				isHovered,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	return createElement(dom.div, {
		...mergeProps(otherProps, hoverProps),
		...renderProps,
		ref,
		'data-hovered': isHovered || undefined,
		'data-orientation': state.orientation || undefined,
		'data-disabled': state.isDisabled || undefined,
	});
}
