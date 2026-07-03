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

/**
 * Normalize a style-object key to a CSS property name CSSOM accepts. Supports
 * BOTH kebab-case (`font-size`) and React-style camelCase (`fontSize`) keys —
 * the latter is converted to kebab. Mirrors React's hyphenateStyleName:
 *   fontSize        → font-size
 *   backgroundColor → background-color
 *   WebkitTransform → -webkit-transform   (leading uppercase = vendor prefix)
 *   msFilter        → -ms-filter          (the `ms` prefix gets a leading dash)
 * Custom properties (`--myVar`) and already-hyphenated names (anything starting
 * with `-`) pass through verbatim — custom properties are case-sensitive and
 * must NOT be hyphenated. No regex (char-walk) to avoid backtracking concerns.
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

function hyphenateStyleName(name: string): string {
	// `--custom-prop` and pre-hyphenated `-webkit-…` keys: leave untouched.
	if (name.charCodeAt(0) === 45 /* - */) return name;
	// Fast path: no uppercase → already kebab (the common case), no allocation.
	let hasUpper = false;
	for (let i = 0; i < name.length; i++) {
		const c = name.charCodeAt(i);
		if (c >= 65 && c <= 90) {
			hasUpper = true;
			break;
		}
	}
	if (!hasUpper) return name;
	let out = '';
	for (let i = 0; i < name.length; i++) {
		const c = name.charCodeAt(i);
		// Uppercase → `-` + lowercase. A leading uppercase therefore yields the
		// leading dash a vendor prefix needs (`WebkitX` → `-webkit-x`).
		if (c >= 65 && c <= 90) out += '-' + String.fromCharCode(c + 32);
		else out += name[i];
	}
	// React parity: `msFoo` → `ms-foo` (above) → `-ms-foo`.
	if (
		out.charCodeAt(0) === 109 /* m */ &&
		out.charCodeAt(1) === 115 /* s */ &&
		out.charCodeAt(2) === 45
	) {
		out = '-' + out;
	}
	return out;
}
