// WCAG contrast helpers for text sitting on the benchmark palette's colored
// fills. The palette spans light and dark fills, so no single ink clears
// 4.5:1 on all of them — pick the higher-contrast of the two per fill.

function channelToLinear(v: number): number {
	const s = v / 255;
	return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0–1) of a `#rrggbb` color. */
export function luminance(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	return (
		0.2126 * channelToLinear((n >> 16) & 255) +
		0.7152 * channelToLinear((n >> 8) & 255) +
		0.0722 * channelToLinear(n & 255)
	);
}

export interface FillInk {
	color: string;
	shadow: string;
}

const DARK_INK: FillInk = { color: '#16181d', shadow: '0 1px 2px rgba(255, 255, 255, 0.45)' };
const LIGHT_INK: FillInk = { color: '#ffffff', shadow: '0 1px 2px rgba(0, 0, 0, 0.4)' };
const DARK_INK_RATIO_BASE = luminance(DARK_INK.color) + 0.05;

/** The higher-contrast ink (plus matching halo) for a `#rrggbb` fill. */
export function inkOnFill(hex: string): FillInk {
	const l = luminance(hex) + 0.05;
	return l / DARK_INK_RATIO_BASE >= 1.05 / l ? DARK_INK : LIGHT_INK;
}
