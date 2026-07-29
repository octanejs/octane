/**
 * PrimJS (the Lynx JS engine) violates the `Object.getOwnPropertySymbols`
 * contract for arrays: it returns the integer index keys as strings, so a
 * plain `[1, 2]` reports two "symbols". Filter to real symbols so wire-value
 * validation rejects only genuine symbol-keyed fields on every engine.
 */
export function hasOwnSymbolFields(value: object): boolean {
	const keys = Object.getOwnPropertySymbols(value);
	for (const key of keys) {
		if (typeof key === 'symbol') return true;
	}
	return false;
}
