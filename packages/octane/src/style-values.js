/** Canonical CSS serialization shared by static bakes, renderers and DOM bindings. */
// React's `isUnitlessNumber` set. Stored in a canonical form — lowercased with
// dashes stripped — so a camelCase (`lineHeight`), kebab (`line-height`), or
// vendor-prefixed key all match after the same normalization.
const UNITLESS_STYLE_PROPS = new Set();
for (const base of [
	'animationIterationCount',
	'aspectRatio',
	'borderImageOutset',
	'borderImageSlice',
	'borderImageWidth',
	'boxFlex',
	'boxFlexGroup',
	'boxOrdinalGroup',
	'columnCount',
	'columns',
	'flex',
	'flexGrow',
	'flexPositive',
	'flexShrink',
	'flexNegative',
	'flexOrder',
	'gridArea',
	'gridRow',
	'gridRowEnd',
	'gridRowSpan',
	'gridRowStart',
	'gridColumn',
	'gridColumnEnd',
	'gridColumnSpan',
	'gridColumnStart',
	'fontWeight',
	'lineClamp',
	'lineHeight',
	'opacity',
	'order',
	'orphans',
	'scale',
	'tabSize',
	'widows',
	'zIndex',
	'zoom',
	'fillOpacity',
	'floodOpacity',
	'stopOpacity',
	'strokeDasharray',
	'strokeDashoffset',
	'strokeMiterlimit',
	'strokeOpacity',
	'strokeWidth',
]) {
	const c = base.toLowerCase();
	// The bare property + the vendor-prefixed variants React also treats as
	// unitless (`WebkitBoxFlex`, `msFlex`, …) → canonical `webkitboxflex`, `msflex`.
	UNITLESS_STYLE_PROPS.add(c);
	UNITLESS_STYLE_PROPS.add('webkit' + c);
	UNITLESS_STYLE_PROPS.add('ms' + c);
	UNITLESS_STYLE_PROPS.add('moz' + c);
	UNITLESS_STYLE_PROPS.add('o' + c);
}

/**
 * True if `name` (camelCase, kebab, or vendor-prefixed) is a unitless CSS
 * property.
 *
 * Memoized: the key universe is bounded (CSS property names), and numeric
 * style writes hit this per key per write — at animation frequency the
 * replaceAll + toLowerCase allocation would dominate. Same rationale as
 * `styleName` in css.ts. The cache stores the boolean so a miss (`width`)
 * is as cheap as a hit (`opacity`) after the first lookup.
 */
const unitlessStylePropCache = new Map();

export function isUnitlessStyleProp(name) {
	const cached = unitlessStylePropCache.get(name);
	if (cached !== undefined) return cached;
	const result = UNITLESS_STYLE_PROPS.has(name.replaceAll('-', '').toLowerCase());
	unitlessStylePropCache.set(name, result);
	return result;
}

/**
 * Coerce a style-object value to its CSS string, React-style: a bare number gets
 * `px` appended — except `0`, custom properties (`--x`), and unitless properties.
 * `name` is the ORIGINAL key (any casing); everything else stringifies as-is.
 * Shared by the client (`setStyle`), SSR (`ssrStyle`), and the compiler's
 * static-object bake so all three agree.
 */
export function cssStyleValue(name, value) {
	if (
		typeof value === 'number' &&
		value !== 0 &&
		name.charCodeAt(0) !== 45 /* not a --custom-property */ &&
		!isUnitlessStyleProp(name)
	) {
		return value + 'px';
	}
	// Trim string values (React parity, CSSPropertyOperations-test.js:32): the
	// client CSSOM trims on parse, so an untrimmed SSR emit would be a
	// server/client byte divergence for the same style object.
	return typeof value === 'string' ? value.trim() : '' + value;
}

/**
 * camelCase / vendor-prefixed style key → the CSS property name CSSOM accepts.
 * Mirrors React's hyphenateStyleName:
 *   fontSize        → font-size
 *   WebkitTransform → -webkit-transform   (leading uppercase = vendor prefix)
 *   msFilter        → -ms-filter          (the `ms` prefix gets a leading dash)
 * Custom properties (`--myVar`) and already-hyphenated names (anything starting
 * with `-`) pass through verbatim — custom properties are case-sensitive and
 * must NOT be hyphenated. No regex (char-walk) to avoid backtracking concerns.
 * The client's hot per-write path uses the memoized `styleName` wrapper in
 * css.ts; the compiler's static bake calls this directly (compile-time only).
 */
export function hyphenateStyleName(name) {
	if (name === 'cssFloat') return 'float';
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
