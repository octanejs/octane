// Behavioral port of react-spring v10.1.2 packages/shared/src/createInterpolator.ts.
import type {
	EasingFunction,
	ExtrapolateType,
	InterpolatorConfig,
	InterpolatorFn,
} from '../types/index';
import { createStringInterpolator } from './stringInterpolation';

export function createInterpolator<Output>(
	config: InterpolatorConfig<Output>,
): InterpolatorFn<Output>;
export function createInterpolator(
	range: readonly number[],
	output: readonly number[],
	extrapolate?: ExtrapolateType,
): InterpolatorFn<number>;
export function createInterpolator<Output>(
	range: InterpolatorConfig<Output> | readonly number[] | InterpolatorFn<Output>,
	output?: readonly number[],
	extrapolate?: ExtrapolateType,
): InterpolatorFn<Output> {
	if (typeof range === 'function') return range;
	if (Array.isArray(range)) {
		return createInterpolator({ range, output: output!, extrapolate }) as InterpolatorFn<Output>;
	}
	const config = range as InterpolatorConfig<Output>;
	if (typeof config.output[0] === 'string') {
		return createStringInterpolator(config as InterpolatorConfig<string>) as InterpolatorFn<Output>;
	}
	const outputRange = config.output as readonly number[];
	const inputRange = config.range ?? [0, 1];
	const easing = config.easing ?? ((value) => value);
	return ((input: number) => {
		const index = findRange(input, inputRange);
		return interpolate(
			input,
			inputRange[index]!,
			inputRange[index + 1]!,
			outputRange[index]!,
			outputRange[index + 1]!,
			easing,
			config.extrapolateLeft ?? config.extrapolate ?? 'extend',
			config.extrapolateRight ?? config.extrapolate ?? 'extend',
			config.map,
		);
	}) as unknown as InterpolatorFn<Output>;
}

function interpolate(
	input: number,
	inputMin: number,
	inputMax: number,
	outputMin: number,
	outputMax: number,
	easing: EasingFunction,
	extrapolateLeft: ExtrapolateType,
	extrapolateRight: ExtrapolateType,
	map?: (value: number) => number,
): number {
	let result = map ? map(input) : input;
	if (result < inputMin) {
		if (extrapolateLeft === 'identity') return result;
		if (extrapolateLeft === 'clamp') result = inputMin;
	}
	if (result > inputMax) {
		if (extrapolateRight === 'identity') return result;
		if (extrapolateRight === 'clamp') result = inputMax;
	}
	if (outputMin === outputMax) return outputMin;
	if (inputMin === inputMax) return input <= inputMin ? outputMin : outputMax;
	if (inputMin === -Infinity) result = -result;
	else if (inputMax === Infinity) result -= inputMin;
	else result = (result - inputMin) / (inputMax - inputMin);
	result = easing(result);
	if (outputMin === -Infinity) return -result;
	if (outputMax === Infinity) return result + outputMin;
	return result * (outputMax - outputMin) + outputMin;
}

function findRange(input: number, inputRange: readonly number[]): number {
	let index = 1;
	for (; index < inputRange.length - 1; index++) if (inputRange[index]! >= input) break;
	return index - 1;
}
