// Ported from .base-ui/packages/react/src/meter/ (v1.6.0): root/MeterRoot,
// root/MeterRootContext, track/MeterTrack, indicator/MeterIndicator, value/MeterValue,
// label/MeterLabel — plus its `index.parts` (the `Meter` namespace).
//
// A meter visualizes a value within a known range. `Meter.Root` (`role="meter"`) owns
// the range math and screen-reader aria; `Track`/`Indicator` draw the bar; `Value`/`Label`
// render text. Base UI uses a PLAIN React context — ported as a plain octane createContext.
import { createContext, createElement, useContext, useMemo, useState } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import { useRegisteredLabelId } from './utils/useRegisteredLabelId';
import { valueToPercent } from './utils/valueToPercent';
import { clamp } from './utils/clamp';
import { formatNumber } from './utils/formatNumber';
import { visuallyHidden } from './utils/visuallyHidden';

// --- Context -----------------------------------------------------------------

export interface MeterRootContextValue {
	formattedValue: string;
	max: number;
	min: number;
	/** The value normalized to a `0`–`100` percentage of the range, clamped to those bounds. */
	percentageValue: number;
	setLabelId: (id: string | undefined) => void;
	value: number;
}

const MeterRootContext = createContext<MeterRootContextValue | undefined>(undefined);

function useMeterRootContext(): MeterRootContextValue {
	const context = useContext(MeterRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: MeterRootContext is missing. Meter parts must be placed within <Meter.Root>.',
		);
	}
	return context;
}

// --- Root --------------------------------------------------------------------

export interface MeterRootProps {
	'aria-valuetext'?: string;
	format?: Intl.NumberFormatOptions;
	getAriaValueText?: (formattedValue: string, value: number) => string;
	locale?: Intl.LocalesArgument;
	max?: number;
	min?: number;
	value: number;
	render?: RenderProp<Record<string, never>>;
	className?: string | ((state: Record<string, never>) => string | undefined);
	style?: Record<string, any>;
	ref?: any;
	[key: string]: any;
}

function MeterRoot(props: MeterRootProps): any {
	const slot = S('MeterRoot');
	const {
		format,
		getAriaValueText,
		locale,
		max = 100,
		min = 0,
		value: valueProp,
		render,
		className,
		children,
		style,
		ref,
		...elementProps
	} = props;

	const [labelId, setLabelId] = useState<string | undefined>(undefined, subSlot(slot, 'labelId'));

	// `clamp` handles infinity, but NaN needs an explicit fallback before normalizing.
	const rawPercentage = valueToPercent(valueProp, min, max);
	const percentageValue = clamp(Number.isNaN(rawPercentage) ? 0 : rawPercentage, 0, 100);
	const clampedValue = clamp(Number.isNaN(valueProp) ? min : valueProp, min, max);

	// Without an explicit `format`, the value shows as its position within the range so
	// the text stays in sync with the indicator fill for any `min`/`max`.
	const formattedValue = format
		? formatNumber(valueProp, locale, format)
		: formatNumber(percentageValue / 100, locale, { style: 'percent' });

	let ariaValuetext = formattedValue;
	if (getAriaValueText) {
		ariaValuetext = getAriaValueText(formattedValue, valueProp);
	}

	const defaultProps = {
		'aria-labelledby': labelId,
		'aria-valuemax': max,
		'aria-valuemin': min,
		'aria-valuenow': clampedValue,
		'aria-valuetext': ariaValuetext,
		role: 'meter',
		children: [
			children,
			// force NVDA to read the label (mui/base-ui#4184)
			createElement('span', { role: 'presentation', style: visuallyHidden, children: 'x' }),
		],
	};

	const contextValue: MeterRootContextValue = useMemo(
		() => ({ formattedValue, max, min, percentageValue, setLabelId, value: valueProp }),
		[formattedValue, max, min, percentageValue, setLabelId, valueProp],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{ ref, props: [defaultProps, elementProps] },
		subSlot(slot, 're'),
	);

	return createElement(MeterRootContext.Provider, { value: contextValue, children: element });
}

// --- Track -------------------------------------------------------------------

function MeterTrack(props: any): any {
	const slot = S('MeterTrack');
	const { render, className, style, ref, ...elementProps } = props;
	return useRenderElement(
		'div',
		{ render, className, style },
		{ ref, props: elementProps },
		subSlot(slot, 're'),
	);
}

// --- Indicator ---------------------------------------------------------------

function MeterIndicator(props: any): any {
	const slot = S('MeterIndicator');
	const { render, className, style, ref, ...elementProps } = props;
	const { percentageValue } = useMeterRootContext();
	return useRenderElement(
		'div',
		{ render, className, style },
		{
			ref,
			props: [
				{ style: { insetInlineStart: 0, height: 'inherit', width: `${percentageValue}%` } },
				elementProps,
			],
		},
		subSlot(slot, 're'),
	);
}

// --- Value -------------------------------------------------------------------

function MeterValue(props: any): any {
	const slot = S('MeterValue');
	const { className, render, children, style, ref, ...elementProps } = props;
	const { value, formattedValue } = useMeterRootContext();
	return useRenderElement(
		'span',
		{ render, className, style },
		{
			ref,
			props: [
				{
					'aria-hidden': true,
					children:
						typeof children === 'function' ? children(formattedValue, value) : formattedValue,
				},
				elementProps,
			],
		},
		subSlot(slot, 're'),
	);
}

// --- Label -------------------------------------------------------------------

function MeterLabel(props: any): any {
	const slot = S('MeterLabel');
	const { render, className, style, id: idProp, ref, ...elementProps } = props;
	const { setLabelId } = useMeterRootContext();
	const id = useRegisteredLabelId(idProp, setLabelId, subSlot(slot, 'labelId'));
	return useRenderElement(
		'span',
		{ render, className, style },
		{ ref, props: [{ id, role: 'presentation' }, elementProps] },
		subSlot(slot, 're'),
	);
}

// --- Namespace (mirrors `export * as Meter`) ---------------------------------

export const Meter = {
	Root: MeterRoot,
	Track: MeterTrack,
	Indicator: MeterIndicator,
	Value: MeterValue,
	Label: MeterLabel,
};
