/** Restore an omitted optional argument when the TSRX compiler supplied its call-site slot. */
export function slotDefault<T>(value: T, fallback: T): T {
	return typeof value === 'symbol' ? fallback : value;
}

/** Remove the TSRX compiler's trailing call-site slot from a variadic argument list. */
export function stripTrailingSlot<T>(values: T[]): T[] {
	return typeof values.at(-1) === 'symbol' ? values.slice(0, -1) : values;
}
