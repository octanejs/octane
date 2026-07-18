// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/numberfield/useNumberFieldState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; `FocusableProps` comes from the ported interactions area (type-only —
// upstream's @react-types/shared version is typed over React synthetic events); the
// public value-level `onChange` callback is unchanged (the onInput rule applies only to
// DOM wiring); `Intl.NumberFormatOptions` dynamic-key reads go through `Record<string,
// any>` casts (upstream relies on looser index typing); explicit dependency arrays are
// kept verbatim (they retain React's exact behavior in octane).
import { clamp, snapValueToStep } from '../utils/number';

import type {
	HelpTextProps,
	InputBase,
	LabelableProps,
	RangeInputBase,
	TextInputBase,
	Validation,
	ValueBase,
} from '@react-types/shared';
import { NumberFormatter, NumberParser } from '@internationalized/number';
import { useCallback, useMemo, useState } from 'octane';

import type { FocusableProps } from '../../interactions/useFocusable';

import { S, splitSlot, subSlot } from '../../internal';
import { type FormValidationState, useFormValidationState } from '../form/useFormValidationState';
import { useControlledState } from '../utils/useControlledState';

export interface NumberFieldProps
	extends
		InputBase,
		Validation<number>,
		FocusableProps,
		TextInputBase,
		ValueBase<number>,
		RangeInputBase<number>,
		LabelableProps,
		HelpTextProps {
	/**
	 * Formatting options for the value displayed in the number field.
	 * This also affects what characters are allowed to be typed by the user.
	 */
	formatOptions?: Intl.NumberFormatOptions;
	/**
	 * Controls the behavior of the number field when the user blurs the field after editing. 'snap'
	 * will clamp the value to the min/max values, and snap to the nearest step value. 'validate' will
	 * not clamp the value, and will validate that the value is within the min/max range and on a
	 * valid step.
	 *
	 * @default 'snap'
	 */
	commitBehavior?: 'snap' | 'validate';
}

export interface NumberFieldState extends FormValidationState {
	/**
	 * The current text value of the input. Updated as the user types,
	 * and formatted according to `formatOptions` on blur.
	 */
	inputValue: string;
	/**
	 * The currently parsed number value, or NaN if a valid number could not be parsed.
	 * Updated based on the `inputValue` as the user types.
	 */
	numberValue: number;
	/** The default value of the input. */
	defaultNumberValue: number;
	/** The minimum value of the number field. */
	minValue?: number;
	/** The maximum value of the number field. */
	maxValue?: number;
	/** Whether the current value can be incremented according to the maximum value and step. */
	canIncrement: boolean;
	/** Whether the current value can be decremented according to the minimum value and step. */
	canDecrement: boolean;
	/**
	 * Validates a user input string according to the current locale and format options. Values can be
	 * partially entered, and may be valid even if they cannot currently be parsed to a number. Can be
	 * used to implement validation as a user types.
	 */
	validate(value: string): boolean;
	/** Sets the current text value of the input. */
	setInputValue(val: string): void;
	/** Sets the number value. */
	setNumberValue(val: number): void;
	/**
	 * Commits the current input value. The value is parsed to a number, clamped according to the
	 * minimum and maximum values of the field, and snapped to the nearest step value. This will fire
	 * the `onChange` prop with the new value, and if uncontrolled, update the `numberValue`.
	 * Typically this is called when the field is blurred.
	 *
	 * @param value - The value to commit. If not provided, the current input value is used.
	 */
	commit(value?: string): void;
	/** Increments the current input value to the next step boundary, and fires `onChange`. */
	increment(): void;
	/** Decrements the current input value to the next step boundary, and fires `onChange`. */
	decrement(): void;
	/** Sets the current value to the `maxValue` if any, and fires `onChange`. */
	incrementToMax(): void;
	/** Sets the current value to the `minValue` if any, and fires `onChange`. */
	decrementToMin(): void;
}

export interface NumberFieldStateOptions extends NumberFieldProps {
	/**
	 * The locale that should be used for parsing.
	 *
	 * @default 'en-US'
	 */
	locale: string;
}

/**
 * Provides state management for a number field component. Number fields allow users to enter a
 * number, and increment or decrement the value using stepper buttons.
 */
export function useNumberFieldState(props: NumberFieldStateOptions): NumberFieldState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useNumberFieldState(
	props: NumberFieldStateOptions,
	slot: symbol | undefined,
): NumberFieldState;
export function useNumberFieldState(...args: any[]): NumberFieldState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useNumberFieldState');
	const props = user[0] as NumberFieldStateOptions;

	let {
		minValue,
		maxValue,
		step,
		formatOptions,
		value,
		defaultValue = NaN,
		onChange,
		locale,
		isDisabled,
		isReadOnly,
		commitBehavior = 'snap',
	} = props;

	if (value === null) {
		value = NaN;
	}

	let snapValue = useCallback(
		(value: number) => {
			return step === undefined || isNaN(step)
				? clamp(value, minValue, maxValue)
				: snapValueToStep(value, minValue, maxValue, step);
		},
		[step, minValue, maxValue],
		subSlot(slot, 'snap'),
	);

	if (value !== undefined && !isNaN(value) && commitBehavior === 'snap') {
		value = snapValue(value);
	}

	if (!isNaN(defaultValue) && commitBehavior === 'snap') {
		defaultValue = snapValue(defaultValue);
	}

	let [numberValue, setNumberValue] = useControlledState<number>(
		value,
		isNaN(defaultValue) ? NaN : defaultValue,
		onChange,
		subSlot(slot, 'number'),
	);
	let [initialValue] = useState(numberValue, subSlot(slot, 'initial'));
	let [inputValue, setInputValue] = useState(
		() =>
			isNaN(numberValue) ? '' : new NumberFormatter(locale, formatOptions).format(numberValue),
		subSlot(slot, 'input'),
	);

	let numberParser = useMemo(
		() => new NumberParser(locale, formatOptions),
		[locale, formatOptions],
		subSlot(slot, 'parser'),
	);
	let numberingSystem = useMemo(
		() => numberParser.getNumberingSystem(inputValue),
		[numberParser, inputValue],
		subSlot(slot, 'numbering'),
	);
	let formatter = useMemo(
		() => new NumberFormatter(locale, { ...formatOptions, numberingSystem }),
		[locale, formatOptions, numberingSystem],
		subSlot(slot, 'formatter'),
	);
	let intlOptions = useMemo(() => formatter.resolvedOptions(), [formatter], subSlot(slot, 'intl'));
	let format = useCallback(
		(value: number) => (isNaN(value) || value === null ? '' : formatter.format(value)),
		[formatter],
		subSlot(slot, 'format'),
	);

	let validation = useFormValidationState(
		{
			...props,
			value: numberValue,
		},
		subSlot(slot, 'validation'),
	);

	let clampStep = step !== undefined && !isNaN(step) ? step : 1;
	if (intlOptions.style === 'percent' && (step === undefined || isNaN(step))) {
		clampStep = 0.01;
	}

	// Update the input value when the number value or format options change. This is done
	// in a useEffect so that the controlled behavior is correct and we only update the
	// textfield after prop changes.
	let [prevValue, setPrevValue] = useState(numberValue, subSlot(slot, 'prevValue'));
	let [prevLocale, setPrevLocale] = useState(locale, subSlot(slot, 'prevLocale'));
	let [prevFormatOptions, setPrevFormatOptions] = useState(
		formatOptions,
		subSlot(slot, 'prevFormat'),
	);
	if (
		!Object.is(numberValue, prevValue) ||
		locale !== prevLocale ||
		!isEqualFormatOptions(formatOptions, prevFormatOptions)
	) {
		setInputValue(format(numberValue));
		setPrevValue(numberValue);
		setPrevLocale(locale);
		setPrevFormatOptions(formatOptions);
	}

	let parsedValue = useMemo(
		() => numberParser.parse(inputValue),
		[numberParser, inputValue],
		subSlot(slot, 'parsed'),
	);
	let commit = (overrideValue?: string) => {
		let newInputValue = overrideValue === undefined ? inputValue : overrideValue;
		let newParsedValue = parsedValue;
		if (overrideValue !== undefined) {
			newParsedValue = numberParser.parse(newInputValue);
		}
		// Set to empty state if input value is empty
		if (!newInputValue.length) {
			setNumberValue(NaN);
			setInputValue(value === undefined ? '' : format(numberValue));
			return;
		}

		// if it failed to parse, then reset input to formatted version of current number
		if (isNaN(newParsedValue)) {
			setInputValue(format(numberValue));
			return;
		}

		// Clamp to min and max, round to the nearest step, and round to specified number of digits
		let clampedValue = commitBehavior === 'snap' ? snapValue(newParsedValue) : newParsedValue;
		clampedValue = numberParser.parse(format(clampedValue));
		let shouldValidate = clampedValue !== numberValue;
		setNumberValue(clampedValue);

		// in a controlled state, the numberValue won't change, so we won't go back to our old input without help
		setInputValue(format(value === undefined ? clampedValue : numberValue));
		if (shouldValidate) {
			validation.commitValidation();
		}
	};

	let safeNextStep = (operation: '+' | '-', minMax: number = 0) => {
		let prev = parsedValue;

		if (isNaN(prev)) {
			// if the input is empty, start from the min/max value when incrementing/decrementing,
			// or zero if there is no min/max value defined.
			let newValue = isNaN(minMax) ? 0 : minMax;
			return snapValueToStep(newValue, minValue, maxValue, clampStep);
		} else {
			// otherwise, first snap the current value to the nearest step. if it moves in the direction
			// we're going, use that value, otherwise add the step and snap that value.
			let newValue = snapValueToStep(prev, minValue, maxValue, clampStep);
			if ((operation === '+' && newValue > prev) || (operation === '-' && newValue < prev)) {
				return newValue;
			}

			return snapValueToStep(
				handleDecimalOperation(operation, prev, clampStep),
				minValue,
				maxValue,
				clampStep,
			);
		}
	};

	let increment = () => {
		let newValue = safeNextStep('+', minValue);

		// if we've arrived at the same value that was previously in the state, the
		// input value should be updated to match
		// ex type 4, press increment, highlight the number in the input, type 4 again, press increment
		// you'd be at 5, then incrementing to 5 again, so no re-render would happen and 4 would be left in the input
		if (newValue === numberValue) {
			setInputValue(format(newValue));
		}

		setNumberValue(newValue);
		validation.commitValidation();
	};

	let decrement = () => {
		let newValue = safeNextStep('-', maxValue);

		if (newValue === numberValue) {
			setInputValue(format(newValue));
		}

		setNumberValue(newValue);
		validation.commitValidation();
	};

	let incrementToMax = () => {
		if (maxValue != null) {
			setNumberValue(snapValueToStep(maxValue, minValue, maxValue, clampStep));
			validation.commitValidation();
		}
	};

	let decrementToMin = () => {
		if (minValue != null) {
			setNumberValue(minValue);
			validation.commitValidation();
		}
	};

	let canIncrement = useMemo(
		() =>
			!isDisabled &&
			!isReadOnly &&
			(isNaN(parsedValue) ||
				maxValue === undefined ||
				isNaN(maxValue) ||
				snapValueToStep(parsedValue, minValue, maxValue, clampStep) > parsedValue ||
				handleDecimalOperation('+', parsedValue, clampStep) <= maxValue),
		[isDisabled, isReadOnly, minValue, maxValue, clampStep, parsedValue],
		subSlot(slot, 'canInc'),
	);

	let canDecrement = useMemo(
		() =>
			!isDisabled &&
			!isReadOnly &&
			(isNaN(parsedValue) ||
				minValue === undefined ||
				isNaN(minValue) ||
				snapValueToStep(parsedValue, minValue, maxValue, clampStep) < parsedValue ||
				handleDecimalOperation('-', parsedValue, clampStep) >= minValue),
		[isDisabled, isReadOnly, minValue, maxValue, clampStep, parsedValue],
		subSlot(slot, 'canDec'),
	);

	let validate = (value: string) => numberParser.isValidPartialNumber(value, minValue, maxValue);

	return {
		...validation,
		validate,
		increment,
		incrementToMax,
		decrement,
		decrementToMin,
		canIncrement,
		canDecrement,
		minValue,
		maxValue,
		numberValue: parsedValue,
		defaultNumberValue: isNaN(defaultValue) ? initialValue : defaultValue,
		setNumberValue,
		setInputValue,
		inputValue,
		commit,
	};
}

// Shallow equality is sufficient here because all values in Intl.NumberFormatOptions are primitives.
function isEqualFormatOptions(
	a: Intl.NumberFormatOptions | undefined,
	b: Intl.NumberFormatOptions | undefined,
) {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	let aKeys = Object.keys(a);
	let bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) {
		return false;
	}
	for (let key of aKeys) {
		if ((b as Record<string, any>)[key] !== (a as Record<string, any>)[key]) {
			return false;
		}
	}
	return true;
}

function handleDecimalOperation(operator: '-' | '+', value1: number, value2: number): number {
	let result = operator === '+' ? value1 + value2 : value1 - value2;

	// Check if we have decimals
	if (value1 % 1 !== 0 || value2 % 1 !== 0) {
		const value1Decimal = value1.toString().split('.');
		const value2Decimal = value2.toString().split('.');
		const value1DecimalLength = (value1Decimal[1] && value1Decimal[1].length) || 0;
		const value2DecimalLength = (value2Decimal[1] && value2Decimal[1].length) || 0;
		const multiplier = Math.pow(10, Math.max(value1DecimalLength, value2DecimalLength));

		// Transform the decimals to integers based on the precision
		value1 = Math.round(value1 * multiplier);
		value2 = Math.round(value2 * multiplier);

		// Perform the operation on integers values to make sure we don't get a fancy decimal value
		result = operator === '+' ? value1 + value2 : value1 - value2;

		// Transform the integer result back to decimal
		result /= multiplier;
	}

	return result;
}
