import { SignalSerializationError } from './errors.js';
import type { EncodedSignalValue } from './types.js';

function unsupported(): never {
	throw new SignalSerializationError(
		'Signal request arguments and seeds require acyclic plain data: undefined, null, booleans, finite numbers, strings, dense arrays, and plain objects with enumerable string data properties.',
	);
}

export function encodeSignalValue(
	value: unknown,
	ancestors = new Set<object>(),
): EncodedSignalValue {
	if (value === undefined) return ['undefined'];
	if (value === null) return ['null'];
	if (typeof value === 'boolean') return ['boolean', value];
	if (typeof value === 'string') return ['string', value];
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return unsupported();
		return ['number', Object.is(value, -0) ? '-0' : value];
	}
	if (typeof value !== 'object' || ancestors.has(value)) return unsupported();
	const prototype = Object.getPrototypeOf(value);
	if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
		return unsupported();
	}
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			const keys = Reflect.ownKeys(value);
			if (keys.length !== value.length + 1) return unsupported();
			const items: EncodedSignalValue[] = [];
			for (let i = 0; i < value.length; i++) {
				const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
				if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return unsupported();
				items.push(encodeSignalValue(descriptor.value, ancestors));
			}
			return ['array', items];
		}
		const keys = Reflect.ownKeys(value);
		if (keys.some((key) => typeof key !== 'string')) return unsupported();
		const entries: [string, EncodedSignalValue][] = [];
		for (const key of (keys as string[]).sort()) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
			if (!descriptor.enumerable || !('value' in descriptor)) return unsupported();
			entries.push([key, encodeSignalValue(descriptor.value, ancestors)]);
		}
		return ['object', entries];
	} finally {
		ancestors.delete(value);
	}
}

export function decodeSignalValue(encoded: EncodedSignalValue): unknown {
	if (!Array.isArray(encoded)) return unsupported();
	const [tag, value] = encoded;
	switch (tag) {
		case 'undefined':
			if (encoded.length !== 1) return unsupported();
			return undefined;
		case 'null':
			if (encoded.length !== 1) return unsupported();
			return null;
		case 'boolean':
			if (encoded.length !== 2 || typeof value !== 'boolean') return unsupported();
			return value;
		case 'number':
			if (encoded.length !== 2) return unsupported();
			if (value === '-0') return -0;
			if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
				return unsupported();
			}
			return value;
		case 'string':
			if (encoded.length !== 2 || typeof value !== 'string') return unsupported();
			return value;
		case 'array':
			if (encoded.length !== 2 || !Array.isArray(value)) return unsupported();
			return Object.freeze(value.map((item) => decodeSignalValue(item as EncodedSignalValue)));
		case 'object': {
			if (encoded.length !== 2 || !Array.isArray(value)) return unsupported();
			const object: Record<string, unknown> = {};
			let previous: string | undefined;
			for (const entry of value) {
				if (
					!Array.isArray(entry) ||
					entry.length !== 2 ||
					typeof entry[0] !== 'string' ||
					(previous !== undefined && entry[0] <= previous)
				) {
					return unsupported();
				}
				previous = entry[0];
				Object.defineProperty(object, entry[0], {
					value: decodeSignalValue(entry[1] as EncodedSignalValue),
					enumerable: true,
				});
			}
			return Object.freeze(object);
		}
		default:
			return unsupported();
	}
}
