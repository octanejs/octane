// Ported verbatim from .base-ui/packages/react/src/number-field/utils/validate.ts. Snapping,
// clamping, and floating-point cleanup for stepped values. Pure.
import { clamp } from '../clamp';
import { getFormatter } from '../formatNumber';
import { parseNumber } from './parse';

const STEP_EPSILON_FACTOR = 1e-10;
const MAX_FLOATING_POINT_CLEANUP_DELTA = 1e-10;

type NumberFormatOptionsWithRounding = Intl.NumberFormatOptions & {
	roundingIncrement?: number;
	roundingMode?: string;
	roundingPriority?: string;
};

export function hasNumberFormatRoundingOptions(
	format?: NumberFormatOptionsWithRounding,
): format is NumberFormatOptionsWithRounding {
	return (
		format?.maximumFractionDigits != null ||
		format?.minimumFractionDigits != null ||
		format?.maximumSignificantDigits != null ||
		format?.minimumSignificantDigits != null ||
		format?.roundingIncrement != null ||
		format?.roundingMode != null ||
		format?.roundingPriority != null
	);
}

export function removeFloatingPointErrors(
	value: number,
	format?: NumberFormatOptionsWithRounding,
): number {
	if (!Number.isFinite(value)) {
		return value;
	}

	if (!hasNumberFormatRoundingOptions(format)) {
		const roundedValue = parseFloat(value.toPrecision(15));
		const cleanupDelta = Math.abs(roundedValue - value);
		const cleanupTolerance = Math.min(
			Number.EPSILON * Math.max(1, Math.abs(value)),
			MAX_FLOATING_POINT_CLEANUP_DELTA,
		);
		return cleanupDelta <= cleanupTolerance ? roundedValue : value;
	}

	const formatter = getFormatter('en-US', {
		...format,
		signDisplay: 'auto',
		currencySign: 'standard',
		notation: format.notation === 'compact' ? 'standard' : format.notation,
		useGrouping: false,
	} as NumberFormatOptionsWithRounding);
	const roundedText = formatter.format(value);
	const roundedValue = parseNumber(roundedText, 'en-US', format);

	if (roundedValue === null) {
		return value;
	}

	return formatter.format(roundedValue) === roundedText ? roundedValue : value;
}

function snapToStep(
	value: number,
	base: number,
	step: number,
	mode: 'directional' | 'nearest' = 'directional',
): number {
	const stepSize = Math.abs(step);
	const direction = Math.sign(step);
	const tolerance = stepSize * STEP_EPSILON_FACTOR * direction;
	const rawSteps = value - base + tolerance;

	if (mode === 'nearest') {
		return base + Math.round(rawSteps / step) * step;
	}

	const snappedSteps =
		direction > 0 ? Math.floor(rawSteps / stepSize) : Math.ceil(rawSteps / stepSize);
	return base + snappedSteps * stepSize;
}

export function toValidatedNumber(
	value: number | null,
	{
		step,
		minWithDefault,
		maxWithDefault,
		minWithZeroDefault,
		format,
		snapOnStep,
		small,
		clamp: shouldClamp,
	}: {
		step: number | undefined;
		minWithDefault: number;
		maxWithDefault: number;
		minWithZeroDefault: number;
		format: NumberFormatOptionsWithRounding | undefined;
		snapOnStep: boolean;
		small: boolean;
		clamp: boolean;
	},
): number | null {
	if (value === null) {
		return value;
	}

	let nextValue = value;

	if (step != null && snapOnStep && step !== 0) {
		const base =
			small || minWithDefault === Number.MIN_SAFE_INTEGER ? minWithZeroDefault : minWithDefault;
		nextValue = snapToStep(nextValue, base, step, small ? 'nearest' : 'directional');
	}

	if (shouldClamp) {
		nextValue = clamp(nextValue, minWithDefault, maxWithDefault);
	}

	if (step == null && !hasNumberFormatRoundingOptions(format)) {
		return nextValue;
	}

	const roundedValue = removeFloatingPointErrors(nextValue, format);
	return shouldClamp ? clamp(roundedValue, minWithDefault, maxWithDefault) : roundedValue;
}
