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
 * Payload of the text-hole separator comment `<!-- -->` the server emits
 * between two adjacent text nodes when at least one side is a DYNAMIC text
 * hole (React's convention). Without it the browser's HTML parser would merge
 * the two texts into ONE node and the client's hydration walk would come up a
 * node short (losing the second hole's content). The compiler's server emit
 * (`ssrEmitNodes` in `octane/compiler`) writes it; the client's hole-aware
 * `sibling()` walk (runtime.ts) treats it as a protocol node — stepping across
 * it between two text holes, or adopting it as the insert-before stand-in
 * position when a hole's server text was empty.
 */
export const HYDRATION_TEXT_SEP = ' ';

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

// ── Streaming SSR protocol (renderToPipeableStream / renderToReadableStream) ──
// A boundary that is still PENDING when the shell flushes emits its fallback
// with a leading `<template data-oct-b="N">` sentinel. When the boundary's data
// resolves, the stream appends a hidden segment `<div hidden data-oct-s="N">`
// holding the real content (+ that boundary's use() seed JSON in a
// `data-oct-seed` script) and an inline `$OCTRC("N")` call that swaps the
// content into the boundary's range, stashes the seeds on `window.$OCTS`, and
// replaces the template with a `<!--oct-seed:N-->` comment the client's
// hydration uses to scope that boundary's seeds.
/** Sentinel <template> attribute marking a pending streamed boundary. */
export const STREAM_BOUNDARY_ATTR = 'data-oct-b';
/** Hidden segment container attribute carrying a completed boundary's content. */
export const STREAM_SEGMENT_ATTR = 'data-oct-s';
/** Per-boundary seed-JSON script attribute (inside the segment). */
export const STREAM_SEED_ATTR = 'data-oct-seed';
/** Comment-data prefix left in a swapped boundary for hydration seed scoping. */
export const STREAM_SEED_COMMENT = 'oct-seed:';

// ---------------------------------------------------------------------------
// Attribute value-type tables — React parity where the FUNCTIONAL outcome
// would flip. Shared by the client (`setAttribute`, runtime.ts) and SSR
// (`ssrAttr`, runtime.server.ts) so both sides serialize/write the same
// presence/absence for the same value — otherwise hydration would resurrect
// an attribute SSR omitted (or vice versa) and warn on the divergence.
// Custom elements are exempt everywhere (raw attribute semantics).
// ---------------------------------------------------------------------------

// NOTE deliberately NO boolean-prop truthiness table (React coerces
// `hidden={0}` / `inert=""` to absent): octane's ADJUDICATED divergence
// (2026-07-04, see dom-attributes.test.ts) writes attribute values through
// natively — a falsy non-boolean stays present exactly as hand-written markup
// would be, and authors pass a real boolean for JS-boolean behavior.

/**
 * React's POSITIVE-numeric props: values below 1 (incl. 0 and non-numeric)
 * drop — `size="0"` is invalid per the HTML spec (size must be > 0).
 */
export const POSITIVE_NUMERIC_ATTR_PROPS = new Set(['size', 'cols', 'rows', 'span']);

/**
 * String-typed props where a boolean value is meaningless and React drops it
 * (`href={true}` must not become a present empty-URL link). `download` is NOT
 * here — it's React's overloaded boolean (true → bare attribute).
 */
export const BOOLEAN_DROPPED_STRING_ATTR_PROPS = new Set([
	'href',
	'src',
	'for',
	'action',
	'formaction',
]);

/**
 * React 19's attribute-alias table (ReactDOMComponent.js `aliases`, verbatim)
 * plus the namespaced camelCase props React handles as switch cases
 * (`xlinkHref` → `xlink:href`, `xmlLang` → `xml:lang` — the prefixed form
 * routes through the client's attrNamespace / serializes as-is on the server).
 * camelCase JSX prop → the attribute the browser actually understands
 * (`strokeWidth` → `stroke-width`); names not listed write verbatim — the set
 * is an ALLOWLIST, not mechanical hyphenation (`viewBox` stays camelCase).
 * Applied by the client's `setAttribute` (spreads / dynamic bindings / de-opt),
 * the server's `ssrAttr`, and — DUPLICATED, keep in sync — the compiler's
 * `normalizeJsxAttrName` (compile.js), which bakes static attributes into
 * template/SSR markup. Custom elements are exempt everywhere (raw props).
 */
export const ATTRIBUTE_ALIASES: Map<string, string> = new Map([
	['acceptCharset', 'accept-charset'],
	['htmlFor', 'for'],
	['httpEquiv', 'http-equiv'],
	['crossOrigin', 'crossorigin'],
	['accentHeight', 'accent-height'],
	['alignmentBaseline', 'alignment-baseline'],
	['arabicForm', 'arabic-form'],
	['baselineShift', 'baseline-shift'],
	['capHeight', 'cap-height'],
	['clipPath', 'clip-path'],
	['clipRule', 'clip-rule'],
	['colorInterpolation', 'color-interpolation'],
	['colorInterpolationFilters', 'color-interpolation-filters'],
	['colorProfile', 'color-profile'],
	['colorRendering', 'color-rendering'],
	['dominantBaseline', 'dominant-baseline'],
	['enableBackground', 'enable-background'],
	['fillOpacity', 'fill-opacity'],
	['fillRule', 'fill-rule'],
	['floodColor', 'flood-color'],
	['floodOpacity', 'flood-opacity'],
	['fontFamily', 'font-family'],
	['fontSize', 'font-size'],
	['fontSizeAdjust', 'font-size-adjust'],
	['fontStretch', 'font-stretch'],
	['fontStyle', 'font-style'],
	['fontVariant', 'font-variant'],
	['fontWeight', 'font-weight'],
	['glyphName', 'glyph-name'],
	['glyphOrientationHorizontal', 'glyph-orientation-horizontal'],
	['glyphOrientationVertical', 'glyph-orientation-vertical'],
	['horizAdvX', 'horiz-adv-x'],
	['horizOriginX', 'horiz-origin-x'],
	['imageRendering', 'image-rendering'],
	['letterSpacing', 'letter-spacing'],
	['lightingColor', 'lighting-color'],
	['markerEnd', 'marker-end'],
	['markerMid', 'marker-mid'],
	['markerStart', 'marker-start'],
	['overlinePosition', 'overline-position'],
	['overlineThickness', 'overline-thickness'],
	['paintOrder', 'paint-order'],
	['panose-1', 'panose-1'],
	['pointerEvents', 'pointer-events'],
	['renderingIntent', 'rendering-intent'],
	['shapeRendering', 'shape-rendering'],
	['stopColor', 'stop-color'],
	['stopOpacity', 'stop-opacity'],
	['strikethroughPosition', 'strikethrough-position'],
	['strikethroughThickness', 'strikethrough-thickness'],
	['strokeDasharray', 'stroke-dasharray'],
	['strokeDashoffset', 'stroke-dashoffset'],
	['strokeLinecap', 'stroke-linecap'],
	['strokeLinejoin', 'stroke-linejoin'],
	['strokeMiterlimit', 'stroke-miterlimit'],
	['strokeOpacity', 'stroke-opacity'],
	['strokeWidth', 'stroke-width'],
	['textAnchor', 'text-anchor'],
	['textDecoration', 'text-decoration'],
	['textRendering', 'text-rendering'],
	['transformOrigin', 'transform-origin'],
	['underlinePosition', 'underline-position'],
	['underlineThickness', 'underline-thickness'],
	['unicodeBidi', 'unicode-bidi'],
	['unicodeRange', 'unicode-range'],
	['unitsPerEm', 'units-per-em'],
	['vAlphabetic', 'v-alphabetic'],
	['vHanging', 'v-hanging'],
	['vIdeographic', 'v-ideographic'],
	['vMathematical', 'v-mathematical'],
	['vectorEffect', 'vector-effect'],
	['vertAdvY', 'vert-adv-y'],
	['vertOriginX', 'vert-origin-x'],
	['vertOriginY', 'vert-origin-y'],
	['wordSpacing', 'word-spacing'],
	['writingMode', 'writing-mode'],
	['xmlnsXlink', 'xmlns:xlink'],
	['xHeight', 'x-height'],
	['xlinkActuate', 'xlink:actuate'],
	['xlinkArcrole', 'xlink:arcrole'],
	['xlinkHref', 'xlink:href'],
	['xlinkRole', 'xlink:role'],
	['xlinkShow', 'xlink:show'],
	['xlinkTitle', 'xlink:title'],
	['xlinkType', 'xlink:type'],
	['xmlBase', 'xml:base'],
	['xmlLang', 'xml:lang'],
	['xmlSpace', 'xml:space'],
]);

/**
 * The three global ENUMERATED attributes whose boolean prop forms must
 * stringify: `false` must WRITE "false" (an ABSENT attribute means "inherit /
 * UA default", a different state), and `true` writes "true". Applies on every
 * element (they're global attributes — custom elements included). Matched
 * case-insensitively: JSX arrives camelCase (`spellCheck`), spreads/de-opt
 * props may arrive lowercase.
 */
export function isEnumeratedBooleanAttr(name: string): boolean {
	// Length-bucketed so non-matching names never pay the toLowerCase.
	switch (name.length) {
		case 10:
			return name.toLowerCase() === 'spellcheck';
		case 9:
			return name.toLowerCase() === 'draggable';
		case 15:
			return name.toLowerCase() === 'contenteditable';
	}
	return false;
}

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
	// Trim string values (React parity, CSSPropertyOperations-test.js:32): the
	// client CSSOM trims on parse, so an untrimmed SSR emit would be a
	// server/client byte divergence for the same style object.
	return typeof value === 'string' ? value.trim() : '' + value;
}
