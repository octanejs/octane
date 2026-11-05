const schemaBrand: unique symbol = Symbol();
export interface DataSchema<T> {
	readonly [schemaBrand]: true;
	/** Canonical identity of the validated wire shape, including its constraints. */
	readonly identity: string;
	readonly parse: (raw: unknown) => T;
}
// Keep the descriptor private. Consumers can compare identities without mutating a nested schema.
const shapes = new WeakMap<object, unknown>();
function schemaShape(schema: DataSchema<unknown>) {
	if (!shapes.has(schema)) throw Error('Unsupported or opaque data schema');
	return shapes.get(schema);
}
function schema<T>(descriptor: unknown, parse: (raw: unknown) => T): DataSchema<T> {
	const value = Object.freeze({
		[schemaBrand]: true as const,
		identity: JSON.stringify(descriptor),
		parse,
	});
	shapes.set(value, descriptor);
	return value;
}
function invalid(): never {
	throw Error('Value does not match its data schema');
}
function bound<K extends string>(
	options: Partial<Record<K, number>>,
	name: K,
	fallback: number,
): number {
	if (Reflect.ownKeys(options).some((key) => key !== name))
		throw Error('Unsupported data schema constraint');
	const value = options[name];
	if (value === undefined) return fallback;
	if (!Number.isSafeInteger(value)) throw Error('Expected a safe integer constraint');
	return value;
}
export const dataSchema = Object.freeze({
	string(options: { minLength?: number } = {}) {
		const min = bound(options, 'minLength', 0);
		if (min < 0) throw Error('Invalid minimum string length');
		return schema(['string', min], (v) =>
			typeof v === 'string' && v.length >= min ? v : invalid(),
		);
	},
	integer(options: { minimum?: number } = {}) {
		const min = bound(options, 'minimum', Number.MIN_SAFE_INTEGER);
		return schema(['integer', min], (v) =>
			typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : invalid(),
		);
	},
	boolean() {
		return schema(['boolean'], (v) => (typeof v === 'boolean' ? v : invalid()));
	},
	enum<T extends string>(values: readonly [T, ...T[]]): DataSchema<T> {
		if (!Array.isArray(values)) throw Error('A data schema enum requires an array');
		const members = new Set<string>(values);
		if (
			!members.size ||
			members.size !== values.length ||
			[...members].some((value) => typeof value !== 'string')
		)
			throw Error('A data schema enum requires distinct string literals');
		// The order in which members are declared does not change the wire contract.
		return schema(['enum', [...members].sort()], (value) => {
			if (typeof value !== 'string' || !members.has(value)) return invalid();
			return value as T;
		});
	},
	nullable<T>(item: DataSchema<T>): DataSchema<T | null> {
		return schema(['nullable', schemaShape(item)], (value) =>
			value === null ? null : item.parse(value),
		);
	},
	array<T>(item: DataSchema<T>) {
		return schema(['array', schemaShape(item)], (v) => {
			if (!Array.isArray(v) || Reflect.ownKeys(v).length !== v.length + 1) return invalid();
			const values: T[] = [];
			for (let i = 0; i < v.length; i++) {
				const prop = Object.getOwnPropertyDescriptor(v, i);
				if (!prop?.enumerable || !('value' in prop)) return invalid();
				values.push(item.parse(prop.value));
			}
			return values;
		});
	},
	object<F extends Record<string, DataSchema<unknown>>>(fields: F) {
		if (
			!fields ||
			![null, Object.prototype].includes(Object.getPrototypeOf(fields)) ||
			Reflect.ownKeys(fields).length !== Object.keys(fields).length
		)
			throw Error('Unsupported object data schema');
		const definitions = Object.keys(fields)
			.sort()
			.map((name) => {
				const prop = Object.getOwnPropertyDescriptor(fields, name)!;
				if (!('value' in prop)) throw Error('Unsupported object data schema');
				return [name, prop.value as DataSchema<unknown>] as const;
			});
		return schema(
			['object', definitions.map(([name, field]) => [name, schemaShape(field)])],
			(v) => {
				if (
					!v ||
					typeof v !== 'object' ||
					(Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) ||
					Reflect.ownKeys(v).length !== definitions.length
				)
					return invalid();
				const values = definitions.map(([name, field]) => {
					const prop = Object.getOwnPropertyDescriptor(v, name);
					if (!prop?.enumerable || !('value' in prop)) return invalid();
					return [name, field.parse(prop.value)];
				});
				return Object.fromEntries(values) as { [K in keyof F]: ReturnType<F[K]['parse']> };
			},
		);
	},
});
