// Shared client/SSR CSS helpers. These MUST stay byte-equivalent between the
// client runtime and the server serializer — the differential/hydration suites
// compare their outputs byte-for-byte — so they live in one module both import.

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

import { hyphenateStyleName } from './dom-tables.js';

/**
 * Normalize a style-object key to a CSS property name CSSOM accepts. Supports
 * BOTH kebab-case (`font-size`) and React-style camelCase (`fontSize`) keys —
 * the latter is converted to kebab by `hyphenateStyleName` (dom-tables.js —
 * shared with the compiler's static-object bake so a baked style produces the
 * same CSS a dynamic one would).
 *
 * Memoized: the key universe is bounded (CSS property names), and style-object
 * diffing hits this per key per write — at animation frequency the camelCase
 * char-walk + allocation would dominate. The cache returns the identical string.
 */
const styleNameCache = new Map<string, string>();

export function styleName(name: string): string {
	const cached = styleNameCache.get(name);
	if (cached !== undefined) return cached;
	const result = hyphenateStyleName(name);
	styleNameCache.set(name, result);
	return result;
}
