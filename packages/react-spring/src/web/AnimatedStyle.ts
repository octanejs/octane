import { FrameValue } from '../core/FrameValue';

const transforms =
	/^(matrix3d|matrix|translate3d|translate[XYZ]?|scale3d|scale[XYZ]?|rotate3d|rotate[XYZ]?|skew[XY]?)$/;

function read(value: any): any {
	if (value instanceof FrameValue) return value.get();
	if (Array.isArray(value)) return value.map(read);
	return value;
}

function unit(value: any, suffix: string): any {
	return typeof value === 'number' && value !== 0 ? `${value}${suffix}` : value;
}

function identity(values: any[], expected: number): boolean {
	return values.every(
		(value) => (typeof value === 'number' ? value : Number.parseFloat(value)) === expected,
	);
}

export function resolveAnimatedStyle(input: Record<string, any>): Record<string, any> {
	const { x, y, z, ...source } = input;
	const style: Record<string, any> = {};
	const output: string[] = [];
	let allIdentity = true;
	if (x !== undefined || y !== undefined || z !== undefined) {
		const values = [read(x ?? 0), read(y ?? 0), read(z ?? 0)];
		output.push(`translate3d(${values.map((value) => unit(value, 'px')).join(',')})`);
		allIdentity = identity(values, 0);
	}
	for (const key in source) {
		const value = source[key];
		if (key === 'transform') {
			const resolved = read(value) || '';
			if (resolved) output.push(resolved);
			allIdentity = allIdentity && resolved === '';
		} else if (transforms.test(key)) {
			const values = (Array.isArray(value) ? value : [value]).map(read);
			const suffix = key.startsWith('translate')
				? 'px'
				: key.startsWith('rotate') || key.startsWith('skew')
					? 'deg'
					: '';
			output.push(`${key}(${values.map((item) => unit(item, suffix)).join(',')})`);
			allIdentity = allIdentity && identity(values, key.startsWith('scale') ? 1 : 0);
		} else style[key] = read(value);
	}
	if (output.length) style.transform = allIdentity ? 'none' : ` ${output.join(' ')}`;
	return style;
}
