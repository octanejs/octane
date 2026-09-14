// Pure class composition shared by renderer-free bindings and client/SSR CSS.
// Keep this leaf free of style tables and renderer dependencies.

/**
 * clsx-style class composition (strings, numbers, arrays, objects, nesting;
 * falsy drops out). Octane's `class`/`className` semantics at every apply site.
 */
export function normalizeClass(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value !== 'object') {
		// number → its decimal form; `0` (and any other falsy primitive) drops out.
		return typeof value === 'number' && value ? '' + value : '';
	}
	if (value === null) return '';
	let str = '';
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			const item = value[i];
			if (item) {
				const inner = normalizeClass(item);
				if (inner) str = str ? str + ' ' + inner : inner;
			}
		}
	} else {
		for (const k in value as Record<string, unknown>) {
			if ((value as Record<string, unknown>)[k]) str = str ? str + ' ' + k : k;
		}
	}
	return str;
}
