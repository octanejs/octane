// Value-shape normalization adapted from react-spring v10.1.2 animated/shared string machinery.
const numberPattern = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
const hasNumberPattern = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/;

export function isAnimatable(value: unknown): boolean {
	return (
		typeof value === 'number' ||
		(Array.isArray(value) && value.every((item) => typeof item === 'number')) ||
		(typeof value === 'string' && (hasNumberPattern.test(value) || normalizeColor(value) !== value))
	);
}

export function interpolateValue<T>(from: T, to: T, progress: number): T {
	if (typeof from === 'number' && typeof to === 'number') return mix(from, to, progress) as T;
	if (Array.isArray(from) && Array.isArray(to)) {
		return from.map((value, index) => mix(Number(value), Number(to[index]), progress)) as T;
	}
	if (typeof from === 'string' && typeof to === 'string') {
		const colorFrom = normalizeColor(from);
		const colorTo = normalizeColor(to);
		const color = colorFrom !== from || colorTo !== to;
		const template = color ? colorFrom : from;
		const fromTokens = template.match(numberPattern)?.map(Number) ?? [];
		const toTokens = (color ? colorTo : to).match(numberPattern)?.map(Number) ?? [];
		if (fromTokens.length !== toTokens.length) return (progress < 1 ? from : to) as T;
		let index = 0;
		const value = template.replace(numberPattern, () => {
			const next = mix(fromTokens[index]!, toTokens[index]!, progress);
			index++;
			return String(next);
		});
		return (color ? roundRgba(value) : value) as T;
	}
	return (progress < 1 ? from : to) as T;
}

function mix(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

function normalizeColor(value: string): string {
	const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
	if (!hex) return value;
	const digits = hex[1]!.length === 3 ? [...hex[1]!].map((char) => char + char).join('') : hex[1]!;
	return `rgba(${Number.parseInt(digits.slice(0, 2), 16)}, ${Number.parseInt(digits.slice(2, 4), 16)}, ${Number.parseInt(digits.slice(4, 6), 16)}, 1)`;
}

function roundRgba(value: string): string {
	return value.replace(
		/rgba\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^\)]+)\)/,
		(_, red, green, blue, alpha) =>
			`rgba(${Math.round(Number(red))}, ${Math.round(Number(green))}, ${Math.round(Number(blue))}, ${alpha})`,
	);
}
