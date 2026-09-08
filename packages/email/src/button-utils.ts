import type { EmailStyle } from './types.ts';

type PaddingValue = string | number | undefined;

function toPixels(value: PaddingValue): number {
	if (!value) return 0;
	if (typeof value === 'number') return value;

	const match = /^([\d.]+)(px|em|rem|%)$/.exec(value);
	if (!match) return 0;

	const amount = Number.parseFloat(match[1]!);
	switch (match[2]) {
		case 'em':
		case 'rem':
			return amount * 16;
		case '%':
			return (amount / 100) * 600;
		default:
			return amount;
	}
}

function expandPadding(value: PaddingValue): PaddingValue[] {
	if (typeof value === 'number') return [value, value, value, value];
	if (typeof value !== 'string') return [];

	const values = value.trim().split(/\s+/);
	switch (values.length) {
		case 1:
			return [values[0], values[0], values[0], values[0]];
		case 2:
			return [values[0], values[1], values[0], values[1]];
		case 3:
			return [values[0], values[1], values[2], values[1]];
		case 4:
			return values;
		default:
			return [];
	}
}

export function parseButtonPadding(style: EmailStyle) {
	const expanded = expandPadding(style.padding as PaddingValue);
	const values: PaddingValue[] = [
		(style.paddingTop as PaddingValue) ?? expanded[0],
		(style.paddingRight as PaddingValue) ?? expanded[1],
		(style.paddingBottom as PaddingValue) ?? expanded[2],
		(style.paddingLeft as PaddingValue) ?? expanded[3],
	];
	return values.map((value) => (value === undefined ? undefined : toPixels(value))) as [
		number | undefined,
		number | undefined,
		number | undefined,
		number | undefined,
	];
}

export function computeOutlookSpacing(expectedWidth: number) {
	if (expectedWidth === 0) return [0, 0] as const;

	let spaceCount = 0;
	let fontWidth = Number.POSITIVE_INFINITY;
	while (fontWidth > 5) {
		spaceCount++;
		fontWidth = expectedWidth / spaceCount / 2;
	}
	return [fontWidth, spaceCount] as const;
}

export function pixelsToPoints(value: number | undefined) {
	return value === undefined || Number.isNaN(value) ? undefined : (value * 3) / 4;
}
