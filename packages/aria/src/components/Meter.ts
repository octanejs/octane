// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Meter.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; `clamp` comes
// from the binding's stately utils port.
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import { type AriaMeterProps, useMeter } from '../meter/useMeter';
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

export interface MeterProps
	extends
		Omit<AriaMeterProps, 'label'>,
		RenderProps<MeterRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Meter'
	 */
	className?: ClassNameOrFunction<MeterRenderProps>;
}

export interface MeterRenderProps {
	/**
	 * The value as a percentage between the minimum and maximum.
	 */
	percentage: number;
	/**
	 * A formatted version of the value.
	 *
	 * @selector [aria-valuetext]
	 */
	valueText: string | undefined;
}

export const MeterContext = createContext<ContextValue<MeterProps, HTMLDivElement>>(null);

/**
 * A meter represents a quantity within a known range, or a fractional value.
 */
export function Meter(props: MeterProps): any {
	const slot = S('Meter');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, MeterContext, subSlot(slot, 'ctx'));
	let { value = 0, minValue = 0, maxValue = 100 } = props;
	value = clamp(value, minValue, maxValue);

	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let { meterProps, labelProps } = useMeter({ ...props, label }, subSlot(slot, 'meter'));

	// Calculate the width of the progress bar as a percentage
	let percentage = ((value - minValue) / (maxValue - minValue)) * 100;

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-Meter',
			values: {
				percentage,
				valueText: meterProps['aria-valuetext'],
			},
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, meterProps),
		ref,
		slot: props.slot || undefined,
		children: createElement(LabelContext.Provider, {
			value: { ...labelProps, ref: labelRef, elementType: 'span' },
			children: renderProps.children,
		}),
	});
}
