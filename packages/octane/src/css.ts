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

// Both runtimes share validation text, but React keeps its style-name/value
// warning caches per renderer. Allocate the sets only after the first warning;
// the DEV-guarded callers and their private state disappear from prod bundles.
let warnedStyleNames: Set<string> | null = null;
let warnedStyleValues: Set<string> | null = null;
let warnedStyleNaN = 0;
let warnedStyleInfinity = 0;

/** @internal Development-only React-style inline CSS diagnostics. */
export function devWarnStyleProperty(name: string, value: unknown, server: boolean): void {
	const type = typeof value;
	// React intentionally exempts custom properties from property-name,
	// semicolon, NaN, and Infinity validation; callers still report failed coercion.
	if (name.charCodeAt(0) === 45 && name.charCodeAt(1) === 45) return;

	let prefixLength = 0;
	if (name.startsWith('webkit')) prefixLength = 6;
	else if (name.startsWith('moz')) prefixLength = 3;
	else if (name.charCodeAt(0) === 111 /* o */) prefixLength = 1;
	const following = name.charCodeAt(prefixLength);
	if (prefixLength !== 0 && following >= 65 && following <= 90) {
		const key = (server ? 's:' : 'c:') + name;
		const warned = (warnedStyleNames ??= new Set<string>());
		if (!warned.has(key)) {
			warned.add(key);
			console.error(
				`Unsupported vendor-prefixed style property ${name}. ` +
					`Did you mean ${name.charAt(0).toUpperCase()}${name.slice(1)}?`,
			);
		}
	} else if (type === 'string') {
		const text = value as string;
		if (text.trimEnd().endsWith(';')) {
			const key = (server ? 's:' : 'c:') + text;
			const warned = (warnedStyleValues ??= new Set<string>());
			if (!warned.has(key)) {
				warned.add(key);
				console.error(
					"Style property values shouldn't contain a semicolon. " +
						`Try "${name}: ${text.slice(0, text.lastIndexOf(';'))}" instead.`,
				);
			}
		}
	}

	if (type !== 'number') return;
	const surface = server ? 2 : 1;
	if (Number.isNaN(value)) {
		if ((warnedStyleNaN & surface) !== 0) return;
		warnedStyleNaN |= surface;
		console.error(`\`NaN\` is an invalid value for the \`${name}\` css style property.`);
	} else if (!Number.isFinite(value)) {
		if ((warnedStyleInfinity & surface) !== 0) return;
		warnedStyleInfinity |= surface;
		console.error(`\`Infinity\` is an invalid value for the \`${name}\` css style property.`);
	}
}

/** @internal Development-only guidance after an existing CSS coercion fails. */
export function devWarnStyleCoercion(name: string, value: unknown): void {
	const valueType =
		typeof value === 'symbol'
			? 'Symbol'
			: (value as { constructor?: { name?: string } }).constructor?.name || 'Object';
	console.error(
		`The provided \`${name}\` CSS property is an unsupported type ${valueType}. ` +
			'This value must be coerced to a string before using it here.',
	);
}
