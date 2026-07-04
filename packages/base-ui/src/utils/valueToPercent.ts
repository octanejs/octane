// Ported verbatim from .base-ui/packages/react/src/utils/valueToPercent.ts.
export function valueToPercent(value: number, min: number, max: number): number {
	return ((value - min) * 100) / (max - min);
}
