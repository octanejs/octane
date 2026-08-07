// Scale math for fitting a fixed design frame into a measured container.
//
// Adapted from @lynx-js/go-web (Apache-2.0), src/example-preview/utils/
// fit-scale.ts and number.ts. See ./UPSTREAM.md.
//
// Kept as free functions with no DOM or framework dependency so this module can
// go back upstream unchanged.

export interface FitInput {
	containerWidth: number;
	containerHeight: number;
	baseWidth: number;
	baseHeight: number;
}

/**
 * The two scales that bracket every useful fit.
 *
 * - `contain`: the whole design frame is visible, with letterboxing.
 * - `cover`: the container is filled, with the frame cropped.
 */
export interface ScaleRange {
	contain: number;
	cover: number;
}

export interface FrameOffset {
	offsetX: number;
	offsetY: number;
}

export function isFinitePositive(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

export function computeScaleRange(input: FitInput): ScaleRange {
	const { containerWidth, containerHeight, baseWidth, baseHeight } = input;
	if (!isFinitePositive(baseWidth) || !isFinitePositive(baseHeight)) {
		throw new RangeError(
			`computeScaleRange: baseWidth and baseHeight must be finite and > 0, got ${baseWidth}x${baseHeight}`,
		);
	}
	const ratioW = containerWidth / baseWidth;
	const ratioH = containerHeight / baseHeight;
	return { contain: Math.min(ratioW, ratioH), cover: Math.max(ratioW, ratioH) };
}

/** `t = 0` behaves like contain, `t = 1` like cover. */
export function lerpFitScale({ contain, cover }: ScaleRange, t: number): number {
	return contain + (cover - contain) * t;
}

/**
 * Where to translate a top-left-origin frame so it lands on the alignment
 * point. The frame is anchored to a zero-size box at that point, so the offset
 * is a pure function of the scaled size.
 */
export function computeFrameOffset(input: {
	baseWidth: number;
	baseHeight: number;
	scale: number;
	ax: number;
	ay: number;
}): FrameOffset {
	const { baseWidth, baseHeight, scale, ax, ay } = input;
	return { offsetX: -(baseWidth * scale) * ax, offsetY: -(baseHeight * scale) * ay };
}

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function smoothstep01(value: number): number {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
}
