// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/ProgressBar.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; `clamp` comes
// from the binding's stately utils port.
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import { type AriaProgressBarProps, useProgressBar } from '../progress/useProgressBar';
import { clamp } from '../stately/utils/number';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { LabelContext } from './Label';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
	useSlot,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface ProgressBarProps
	extends
		Omit<AriaProgressBarProps, 'label'>,
		RenderProps<ProgressBarRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ProgressBar'
	 */
	className?: ClassNameOrFunction<ProgressBarRenderProps>;
}

export interface ProgressBarRenderProps {
	/**
	 * The value as a percentage between the minimum and maximum.
	 */
	percentage: number | undefined;
	/**
	 * A formatted version of the value.
	 *
	 * @selector [aria-valuetext]
	 */
	valueText: string | undefined;
	/**
	 * Whether the progress bar is indeterminate.
	 *
	 * @selector :not([aria-valuenow])
	 */
	isIndeterminate: boolean;
}

export const ProgressBarContext =
	createContext<ContextValue<ProgressBarProps, HTMLDivElement>>(null);

/**
 * Progress bars show either determinate or indeterminate progress of an operation
 * over time.
 */
export function ProgressBar(props: ProgressBarProps): any {
	const slot = S('ProgressBar');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, ProgressBarContext, subSlot(slot, 'ctx'));
	let { value = 0, minValue = 0, maxValue = 100, isIndeterminate = false } = props;
	value = clamp(value, minValue, maxValue);

	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let { progressBarProps, labelProps } = useProgressBar(
		{ ...props, label },
		subSlot(slot, 'progressBar'),
	);

	// Calculate the width of the progress bar as a percentage
	let percentage = isIndeterminate ? undefined : ((value - minValue) / (maxValue - minValue)) * 100;

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-ProgressBar',
			values: {
				percentage,
				valueText: progressBarProps['aria-valuetext'],
				isIndeterminate,
			},
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, progressBarProps),
		ref,
		slot: props.slot || undefined,
		children: createElement(LabelContext.Provider, {
			value: { ...labelProps, ref: labelRef, elementType: 'span' },
			children: renderProps.children,
		}),
	});
}
