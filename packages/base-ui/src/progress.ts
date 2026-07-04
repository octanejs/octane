// Ported from .base-ui/packages/react/src/progress/ (v1.6.0): root/ProgressRoot,
// root/ProgressRootContext, root/stateAttributesMapping, track/ProgressTrack,
// indicator/ProgressIndicator, value/ProgressValue, label/ProgressLabel — plus its
// `index.parts` (the `Progress` namespace).
//
// A progress bar. `Progress.Root` (`role="progressbar"`) owns the value/status and aria;
// the `status` state ('indeterminate' | 'progressing' | 'complete') is exposed on every
// part as `data-progressing`/`data-complete`/`data-indeterminate`. Base UI uses a PLAIN
// React context — ported as a plain octane createContext.
import { createContext, createElement, useContext, useMemo, useState } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useRegisteredLabelId } from './utils/useRegisteredLabelId';
import { useValueAsRef } from './utils/useValueAsRef';
import { valueToPercent } from './utils/valueToPercent';
import { formatNumberValue } from './utils/formatNumber';
import { visuallyHidden } from './utils/visuallyHidden';

export type ProgressStatus = 'indeterminate' | 'progressing' | 'complete';

export interface ProgressRootState {
	status: ProgressStatus;
}

// Custom state→data-* mapping: `status` maps to a presence attribute per value, not the
// default `data-status="<value>"`.
const progressStateAttributesMapping: StateAttributesMapping<ProgressRootState> = {
	status(value: ProgressStatus): Record<string, string> | null {
		if (value === 'progressing') {
			return { 'data-progressing': '' };
		}
		if (value === 'complete') {
			return { 'data-complete': '' };
		}
		if (value === 'indeterminate') {
			return { 'data-indeterminate': '' };
		}
		return null;
	},
};

// --- Context -----------------------------------------------------------------

export interface ProgressRootContextValue {
	formattedValue: string;
	max: number;
	min: number;
	value: number | null;
	setLabelId: (id: string | undefined) => void;
	state: ProgressRootState;
	status: ProgressStatus;
}

const ProgressRootContext = createContext<ProgressRootContextValue | undefined>(undefined);

function useProgressRootContext(): ProgressRootContextValue {
	const context = useContext(ProgressRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: ProgressRootContext is missing. Progress parts must be placed within <Progress.Root>.',
		);
	}
	return context;
}

function getDefaultAriaValueText(formattedValue: string | null, value: number | null): string {
	if (value == null) {
		return 'indeterminate progress';
	}
	return formattedValue || `${value}%`;
}

// --- Root --------------------------------------------------------------------

export interface ProgressRootProps {
	'aria-valuetext'?: string;
	format?: Intl.NumberFormatOptions;
	getAriaValueText?: (formattedValue: string | null, value: number | null) => string;
	locale?: Intl.LocalesArgument;
	max?: number;
	min?: number;
	value: number | null;
	render?: RenderProp<ProgressRootState>;
	className?: string | ((state: ProgressRootState) => string | undefined);
	style?: Record<string, any> | ((state: ProgressRootState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function ProgressRoot(props: ProgressRootProps): any {
	const slot = S('ProgressRoot');
	const {
		format,
		getAriaValueText = getDefaultAriaValueText,
		locale,
		max = 100,
		min = 0,
		value,
		render,
		className,
		children,
		style,
		ref,
		...elementProps
	} = props;

	const [labelId, setLabelId] = useState<string | undefined>(undefined, subSlot(slot, 'labelId'));

	const formatOptionsRef = useValueAsRef<Intl.NumberFormatOptions | undefined>(
		format,
		subSlot(slot, 'fmt'),
	);

	let status: ProgressStatus = 'indeterminate';
	if (Number.isFinite(value)) {
		status = value === max ? 'complete' : 'progressing';
	}

	const formattedValue = formatNumberValue(value, locale, formatOptionsRef.current);

	const state: ProgressRootState = useMemo(() => ({ status }), [status], subSlot(slot, 'state'));

	const defaultProps = {
		'aria-labelledby': labelId,
		'aria-valuemax': max,
		'aria-valuemin': min,
		'aria-valuenow': value ?? undefined,
		'aria-valuetext': getAriaValueText(formattedValue, value),
		role: 'progressbar',
		children: [
			children,
			createElement('span', { role: 'presentation', style: visuallyHidden, children: 'x' }),
		],
	};

	const contextValue: ProgressRootContextValue = useMemo(
		() => ({ formattedValue, max, min, setLabelId, state, status, value }),
		[formattedValue, max, min, setLabelId, state, status, value],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [defaultProps, elementProps],
			stateAttributesMapping: progressStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(ProgressRootContext.Provider, { value: contextValue, children: element });
}

// --- Track -------------------------------------------------------------------

function ProgressTrack(props: any): any {
	const slot = S('ProgressTrack');
	const { render, className, style, ref, ...elementProps } = props;
	const { state } = useProgressRootContext();
	return useRenderElement(
		'div',
		{ render, className, style },
		{ state, ref, props: elementProps, stateAttributesMapping: progressStateAttributesMapping },
		subSlot(slot, 're'),
	);
}

// --- Indicator ---------------------------------------------------------------

function ProgressIndicator(props: any): any {
	const slot = S('ProgressIndicator');
	const { render, className, style, ref, ...elementProps } = props;
	const { max, min, value, state } = useProgressRootContext();

	const percentageValue =
		Number.isFinite(value) && value !== null ? valueToPercent(value, min, max) : null;
	const indicatorStyle =
		percentageValue == null
			? {}
			: { insetInlineStart: 0, height: 'inherit', width: `${percentageValue}%` };

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [{ style: indicatorStyle }, elementProps],
			stateAttributesMapping: progressStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Value -------------------------------------------------------------------

function ProgressValue(props: any): any {
	const slot = S('ProgressValue');
	const { className, render, children, style, ref, ...elementProps } = props;
	const { value, formattedValue, state } = useProgressRootContext();

	const formattedValueArg = value == null ? 'indeterminate' : formattedValue;
	const formattedValueDisplay = value == null ? null : formattedValue;

	return useRenderElement(
		'span',
		{ render, className, style },
		{
			state,
			ref,
			props: [
				{
					'aria-hidden': true,
					children:
						typeof children === 'function'
							? children(formattedValueArg, value)
							: formattedValueDisplay,
				},
				elementProps,
			],
			stateAttributesMapping: progressStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Label -------------------------------------------------------------------

function ProgressLabel(props: any): any {
	const slot = S('ProgressLabel');
	const { render, className, style, id: idProp, ref, ...elementProps } = props;
	const { setLabelId, state } = useProgressRootContext();
	const id = useRegisteredLabelId(idProp, setLabelId, subSlot(slot, 'labelId'));
	return useRenderElement(
		'span',
		{ render, className, style },
		{
			state,
			ref,
			props: [{ id, role: 'presentation' }, elementProps],
			stateAttributesMapping: progressStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Namespace (mirrors `export * as Progress`) ------------------------------

export const Progress = {
	Root: ProgressRoot,
	Track: ProgressTrack,
	Indicator: ProgressIndicator,
	Value: ProgressValue,
	Label: ProgressLabel,
};
