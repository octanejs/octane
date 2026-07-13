export type Ref<T> = { current: T | null | undefined };

export type RefOrValue<T> = T | Ref<T> | null | undefined;

function isRef<T>(value: RefOrValue<T>): value is Ref<T> {
	return value != null && typeof value === 'object' && 'current' in value;
}

export function currentValue<T>(value: RefOrValue<T>): NonNullable<T> | undefined {
	if (value == null) return undefined;
	if (isRef(value)) return value.current ?? undefined;
	return value as NonNullable<T>;
}
