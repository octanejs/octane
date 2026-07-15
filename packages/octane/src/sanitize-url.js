/**
 * Shared URL-attribute sanitizer for client templates, dynamic DOM writes, and
 * every server renderer. Keep this regex non-global: repeated updates must
 * test independently rather than inheriting RegExp.lastIndex state.
 *
 * Per React's `react-dom-bindings/src/shared/sanitizeURL.js`, URL parsing drops
 * leading C0 controls/spaces and embedded ASCII tabs/newlines before deciding
 * whether the scheme is `javascript:`.
 */
const IS_JAVASCRIPT_PROTOCOL =
	/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*\:/i;

export const BLOCKED_JAVASCRIPT_URL =
	"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";

// Hyphenated names normally identify custom elements, except for these native
// SVG/MathML names reserved by the Custom Elements spec. Mirrors React DOM's
// `isCustomElement` exclusion list so native URL sinks never inherit raw custom-
// element attribute semantics merely because their tag contains a hyphen.
const RESERVED_HYPHENATED_NATIVE_TAGS = new Set([
	'annotation-xml',
	'color-profile',
	'font-face',
	'font-face-src',
	'font-face-uri',
	'font-face-format',
	'font-face-name',
	'missing-glyph',
]);

/**
 * Replace a script-bearing URL with React's inert diagnostic URL.
 *
 * Callers deliberately pass an already-coerced string so values with an
 * observable `toString()` are evaluated exactly once across validation,
 * hydration comparison, and the final write.
 */
export function sanitizeURL(url) {
	return IS_JAVASCRIPT_PROTOCOL.test(url) ? BLOCKED_JAVASCRIPT_URL : url;
}

/**
 * Whether a native host attribute is one of React DOM's navigable URL sinks.
 * Custom elements retain React 19's raw attribute semantics. `data` is a URL
 * only on `<object>`; arbitrary `data` attributes remain ordinary text.
 */
export function shouldSanitizeURLAttribute(tag, name) {
	// HTML tag/attribute names are ASCII case-insensitive. Normalize here so a
	// dynamic `createElement('OBJECT', {data: ...})` or spread-supplied `HREF`
	// cannot serialize unsafely on the server and then become a lowercase URL
	// sink when the browser parses it. SVG's canonical URL names lower identically.
	tag = tag === undefined ? undefined : tag.toLowerCase();
	if (tag !== undefined && tag.includes('-') && !RESERVED_HYPHENATED_NATIVE_TAGS.has(tag)) {
		return false;
	}
	name = name.toLowerCase();
	return (
		name === 'src' ||
		name === 'href' ||
		name === 'action' ||
		name === 'formaction' ||
		name === 'xlink:href' ||
		name === 'xlinkhref' ||
		(name === 'data' && tag === 'object')
	);
}

/** Sanitize an already-coerced value when `(tag, name)` is a URL sink. */
export function sanitizeURLAttribute(tag, name, value) {
	return shouldSanitizeURLAttribute(tag, name) ? sanitizeURL(value) : value;
}
