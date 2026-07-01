/**
 * Hydration marker protocol — the single source of truth shared by the server
 * emit (the `octane/compiler` compiler's server mode) and the client `hydrate`
 * runtime. The server writes these comment markers into the HTML it produces and
 * the client hydration cursor scans for them to align with the server output, so
 * BOTH sides must use byte-identical strings or hydration fails.
 *
 * Values follow the Svelte/Ripple convention (`[` open, `]` close) so the
 * protocol is familiar and the marker comments are compact.
 *
 * The server emit (runtime.server `ssrBlock` and friends) writes these markers
 * around every dynamic site, and the client `hydrateRoot` cursor scans for them
 * to align with the server output. This module is the shared home both import.
 */

/** Single-character payload of a block-open comment. */
export const HYDRATION_START = '[';
/** Single-character payload of a block-close comment. */
export const HYDRATION_END = ']';

/** Opens a hydratable block (component output / control-flow branch). */
export const BLOCK_OPEN = `<!--${HYDRATION_START}-->`;
/** Closes a hydratable block. */
export const BLOCK_CLOSE = `<!--${HYDRATION_END}-->`;
/** A bare anchor comment used where the client would otherwise clone a `<!>`. */
export const EMPTY_COMMENT = '<!---->';

/**
 * Marker attribute on the inline `<script type="application/json">` that the
 * server emits to carry the JSON-serialized `use(thenable)` values it resolved
 * during render (SSR Suspense). The client `hydrateRoot()` finds this
 * script by attribute, parses it, and seeds the values back into `use()` (in
 * render order) so a hydrating boundary returns synchronously instead of
 * re-suspending. Shared so server emit and client read stay byte-identical.
 */
export const SUSPENSE_SCRIPT_ATTR = 'data-octane-suspense';

/**
 * Sentinel marker for a `use(thenable)` value that resolved to `undefined`.
 * JSON can't represent `undefined` (an array element round-trips to `null`, an
 * object property is dropped), so the server's seed serializer encodes any
 * `undefined` as `{ [UNDEFINED_SENTINEL_KEY]: true }` and the client's parser
 * reviver decodes it back to `undefined`. Shared so both sides agree, and keyed
 * obscurely enough that real resolved data won't collide.
 */
export const UNDEFINED_SENTINEL_KEY = '__octane_new_undefined__';

// ---------------------------------------------------------------------------
// Style value coercion — React parity for numeric style-object values.
//
// React appends `px` to a bare NUMBER given to most CSS properties (`{width: 10}`
// → "10px") but leaves a known set of "unitless" properties raw (`{opacity: 1}`,
// `{zIndex: 5}`, `{lineHeight: 2}`, …). `0` never gets a unit, and custom
// properties (`--x`) are never touched. Shared by the client (`setStyle`), SSR
// (`ssrStyle`), and the compiler's static-object bake so all three agree.
// ---------------------------------------------------------------------------

// React's `isUnitlessNumber` set. Stored in a canonical form — lowercased with
// dashes stripped — so a camelCase (`lineHeight`), kebab (`line-height`), or
// vendor-prefixed key all match after the same normalization.
const UNITLESS_STYLE_PROPS = new Set<string>();
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

/** True if `name` (camelCase, kebab, or vendor-prefixed) is a unitless CSS property. */
export function isUnitlessStyleProp(name: string): boolean {
	return UNITLESS_STYLE_PROPS.has(name.replaceAll('-', '').toLowerCase());
}

/**
 * Coerce a style-object value to its CSS string, React-style: a bare number gets
 * `px` appended — except `0`, custom properties (`--x`), and unitless properties.
 * `name` is the ORIGINAL key (any casing); everything else stringifies as-is.
 */
export function cssStyleValue(name: string, value: unknown): string {
	if (
		typeof value === 'number' &&
		value !== 0 &&
		name.charCodeAt(0) !== 45 /* not a --custom-property */ &&
		!isUnitlessStyleProp(name)
	) {
		return value + 'px';
	}
	return '' + value;
}
