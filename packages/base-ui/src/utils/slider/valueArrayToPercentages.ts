// Ported verbatim from .base-ui/packages/react/src/slider/utils/valueArrayToPercentages.ts.
import { clamp } from '../clamp';
import { valueToPercent } from '../valueToPercent';

export function valueArrayToPercentages(values: number[], min: number, max: number) {
	const output = [];
	for (let i = 0; i < values.length; i += 1) {
		output.push(clamp(valueToPercent(values[i], min, max), 0, 100));
	}
	return output;
}
