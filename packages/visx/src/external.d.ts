declare module 'reduce-css-calc' {
	export default function reduceCssCalc(expression: string): string;
}

declare module 'd3-interpolate-path' {
	/**
	 * Interpolates between two SVG path `d` strings, tolerating a differing
	 * number of points on each side.
	 */
	export function interpolatePath(
		a: string | null | undefined,
		b: string | null | undefined,
		excludeSegment?: (a: unknown, b: unknown) => boolean,
	): (t: number) => string;
}
