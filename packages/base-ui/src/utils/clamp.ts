// Ported verbatim from .base-ui/packages/react/src/internals/clamp.ts.
export function clamp(
	val: number,
	min: number = Number.MIN_SAFE_INTEGER,
	max: number = Number.MAX_SAFE_INTEGER,
): number {
	return Math.max(min, Math.min(val, max));
}
