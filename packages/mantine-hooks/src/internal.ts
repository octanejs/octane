// Compiled TSRX calls append their hook slot as a trailing Symbol. When a public
// hook omits an optional argument, that slot occupies the argument position and
// must be removed before applying the hook's runtime default.
export function withoutSlot<T>(value: T | symbol | undefined): T | undefined {
	return typeof value === 'symbol' ? undefined : value;
}
