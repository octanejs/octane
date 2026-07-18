// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/progress/useProgressBar.ts).
// octane adaptations: ReactNode → any (octane renderables); public-hook slot threading.
import type { AriaLabelingProps, DOMAttributes, DOMProps } from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import { clamp } from '../stately/utils/number';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useLabel } from '../label/useLabel';
import { useNumberFormatter } from '../i18n/useNumberFormatter';

export interface ProgressBarBaseProps {
	/**
	 * The current value (controlled).
	 *
	 * @default 0
	 */
	value?: number;
	/**
	 * The smallest value allowed for the input.
	 *
	 * @default 0
	 */
	minValue?: number;
	/**
	 * The largest value allowed for the input.
	 *
	 * @default 100
	 */
	maxValue?: number;
	/** The content to display as the label. */
	label?: any;
	/**
	 * The display format of the value label.
	 *
	 * @default { style: 'percent' }
	 */
	formatOptions?: Intl.NumberFormatOptions;
	/** The content to display as the value's label (e.g. 1 of 4). */
	valueLabel?: any;
}

export interface AriaProgressBarBaseProps
	extends ProgressBarBaseProps, DOMProps, AriaLabelingProps {}

export interface ProgressBarProps extends ProgressBarBaseProps {
	/**
	 * Whether presentation is indeterminate when progress isn't known.
	 */
	isIndeterminate?: boolean;
}

export interface AriaProgressBarProps extends ProgressBarProps, DOMProps, AriaLabelingProps {}

export interface ProgressBarAria {
	/** Props for the progress bar container element. */
	progressBarProps: DOMAttributes;
	/** Props for the progress bar's visual label element (if any). */
	labelProps: DOMAttributes;
}

export function useProgressBar(props: AriaProgressBarProps): ProgressBarAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useProgressBar(
	props: AriaProgressBarProps,
	slot: symbol | undefined,
): ProgressBarAria;
export function useProgressBar(...args: any[]): ProgressBarAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useProgressBar');
	const props = user[0] as AriaProgressBarProps;

	let {
		value = 0,
		minValue = 0,
		maxValue = 100,
		valueLabel,
		isIndeterminate,
		formatOptions = {
			style: 'percent',
		},
	} = props;

	let domProps = filterDOMProps(props, { labelable: true });
	let { labelProps, fieldProps } = useLabel(
		{
			...props,
			// Progress bar is not an HTML input element so it
			// shouldn't be labeled by a <label> element.
			labelElementType: 'span',
		},
		subSlot(slot, 'label'),
	);

	value = clamp(value, minValue, maxValue);
	let percentage = (value - minValue) / (maxValue - minValue);
	let formatter = useNumberFormatter(formatOptions, subSlot(slot, 'formatter'));

	if (!isIndeterminate && !valueLabel) {
		let valueToFormat = formatOptions.style === 'percent' ? percentage : value;
		valueLabel = formatter.format(valueToFormat);
	}

	return {
		progressBarProps: mergeProps(domProps, {
			...fieldProps,
			'aria-valuenow': isIndeterminate ? undefined : value,
			'aria-valuemin': minValue,
			'aria-valuemax': maxValue,
			'aria-valuetext': isIndeterminate ? undefined : (valueLabel as string),
			role: 'progressbar',
		}),
		labelProps,
	};
}
