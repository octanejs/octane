export const displayValue = 'block';

export let colorEvaluations = 0;

export function recordColor(value) {
	colorEvaluations++;
	return value;
}
