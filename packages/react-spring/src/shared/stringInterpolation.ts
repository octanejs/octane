// Behavioral port of react-spring v10.1.2 packages/shared/src/stringInterpolation.ts.
import type { InterpolatorConfig, InterpolatorFn } from '../types/index';
import { createInterpolator } from './createInterpolator';

const numberRegex = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
const unitRegex = /[a-z%]+/i;
const rgbaRegex = /rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g;

export function createStringInterpolator(
	config: InterpolatorConfig<string>,
): InterpolatorFn<number, string> {
	const output = config.output.slice();
	// Number-less outputs (e.g. `none`) yield `[]` rather than throwing on a
	// null match — see https://github.com/pmndrs/react-spring/issues/2327.
	const tokens = output.map(function extractNumbers(value) {
		return value.match(numberRegex) ?? [];
	});
	const outputRanges = tokens[0]!.map(function buildRange(_, index) {
		return tokens.map(function valueAt(values) {
			if (!(index in values)) throw new Error('The arity of each "output" value must be equal');
			return Number(values[index]);
		});
	});
	const interpolators = outputRanges.map((range) =>
		createInterpolator({ ...config, output: range }),
	);
	const inputRange = config.range ?? [0, 1];
	const decimalCounts = tokens[0]!.map((_, position) => {
		const counts = tokens.map((values) => {
			const token = values[position]!;
			const dot = token.indexOf('.');
			return dot < 0 ? 0 : token.length - dot - 1;
		});
		return counts.every((count) => count === counts[0]) && counts[0]! > 0 ? counts[0]! : null;
	});
	return ((input: number) => {
		const keyframe = inputRange.indexOf(input);
		if (keyframe >= 0) return output[keyframe]!;
		const missingUnit = !unitRegex.test(output[0]!)
			? output.find((value) => unitRegex.test(value))?.replace(numberRegex, '')
			: undefined;
		let position = 0;
		return output[0]!
			.replace(numberRegex, () => {
				const index = position++;
				const value = interpolators[index]!(input);
				const decimals = decimalCounts[index];
				return `${decimals == null ? value : value.toFixed(decimals)}${missingUnit ?? ''}`;
			})
			.replace(
				rgbaRegex,
				(_, r, g, b, alpha) =>
					`rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`,
			);
	}) as unknown as InterpolatorFn<number, string>;
}
