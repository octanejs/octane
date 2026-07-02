// Ported from @radix-ui/react-progress (source:
// .radix-primitives/packages/react/progress/src/progress.tsx). A `role=progressbar` with
// value/max ARIA + `data-state` (indeterminate/loading/complete); Indicator mirrors the
// state for styling.
import { createElement } from 'octane';

import { createContextScope } from './context';
import { Primitive } from './Primitive';

const DEFAULT_MAX = 100;

const [createProgressContext, createProgressScope] = createContextScope('Progress');
export { createProgressScope };
const [ProgressProvider, useProgressContext] = createProgressContext<{
	value: number | null;
	max: number;
}>('Progress');

export function Root(props: any): any {
	const {
		__scopeProgress,
		value: valueProp = null,
		max: maxProp,
		getValueLabel = defaultGetValueLabel,
		...progressProps
	} = props ?? {};
	if ((maxProp || maxProp === 0) && !isValidMaxNumber(maxProp)) {
		console.error(getInvalidMaxError(`${maxProp}`, 'Progress'));
	}
	const max = isValidMaxNumber(maxProp) ? maxProp : DEFAULT_MAX;
	if (valueProp !== null && !isValidValueNumber(valueProp, max)) {
		console.error(getInvalidValueError(`${valueProp}`, 'Progress'));
	}
	const value = isValidValueNumber(valueProp, max) ? valueProp : null;
	const valueLabel = isNumber(value) ? getValueLabel(value, max) : undefined;
	return createElement(ProgressProvider, {
		scope: __scopeProgress,
		value,
		max,
		children: createElement(Primitive.div, {
			'aria-valuemax': max,
			'aria-valuemin': 0,
			'aria-valuenow': isNumber(value) ? value : undefined,
			'aria-valuetext': valueLabel,
			role: 'progressbar',
			'data-state': getProgressState(value, max),
			'data-value': value ?? undefined,
			'data-max': max,
			...progressProps,
		}),
	});
}

export function Indicator(props: any): any {
	const { __scopeProgress, ...indicatorProps } = props ?? {};
	const context = useProgressContext('ProgressIndicator', __scopeProgress);
	return createElement(Primitive.div, {
		'data-state': getProgressState(context.value, context.max),
		'data-value': context.value ?? undefined,
		'data-max': context.max,
		...indicatorProps,
	});
}

function getProgressState(value: number | null | undefined, maxValue: number): string {
	return value == null ? 'indeterminate' : value === maxValue ? 'complete' : 'loading';
}
function defaultGetValueLabel(value: number, max: number): string {
	return `${Math.round((value / max) * 100)}%`;
}
function isNumber(value: any): value is number {
	return typeof value === 'number';
}
function isValidMaxNumber(max: any): max is number {
	return isNumber(max) && !isNaN(max) && max > 0;
}
function isValidValueNumber(value: any, max: number): value is number {
	return isNumber(value) && !isNaN(value) && value <= max && value >= 0;
}
function getInvalidMaxError(propValue: string, componentName: string): string {
	return `Invalid prop \`max\` of value \`${propValue}\` supplied to \`${componentName}\`. Only numbers greater than 0 are valid max values. Defaulting to \`${DEFAULT_MAX}\`.`;
}
function getInvalidValueError(propValue: string, componentName: string): string {
	return `Invalid prop \`value\` of value \`${propValue}\` supplied to \`${componentName}\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or ${DEFAULT_MAX} if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`;
}

export { Root as Progress, Indicator as ProgressIndicator };
