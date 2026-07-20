//#region node_modules/.nitro/vite/services/ssr/assets/runtime.server-w393t-7O.js
/**
* DOM truth tables — the single source shared by the compiler (static bakes),
* the client runtime (dynamic writes), and the SSR serializer.
*
* These tables decide observable output — which attributes render, under what
* name, and in what form — so all three consumers MUST agree or the drift
* surfaces as client/SSR/hydration disagreement (an attribute hydration
* resurrects that SSR omitted, a template namespace the de-opt reconciler
* contradicts, a `px` suffix only one side appends). They used to be
* hand-duplicated per consumer with "keep in sync" comments; now every copy is
* an import of this module.
*
* Deliberately a plain `.js` module: the compiler ships verbatim (never
* transpiled — see scripts/build.mjs), so the shared home must be directly
* loadable by plain Node. The runtimes reach it through `constants.ts`, which
* re-exports the public tables with type annotations (`dom-tables.d.ts` covers
* the direct import). Lookup shapes are unchanged from the pre-dedup copies:
* the same `Set`/`Map` instances, `.has()`/`.get()` at every call site.
*/
/**
* HTML void elements (no content model, no end tag). The compiler rejects
* children/`dangerouslySetInnerHTML` on them at compile time and emits
* self-closing markup; the client's `setAttribute` danger arm guards the
* routes the compiler can't see (spreads, de-opt descriptors); the SSR
* serializer skips the closing tag.
*/
var VOID_ELEMENTS$1 = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr"
]);
/**
* React's BOOLEAN attribute props (ReactDOMComponent's boolean arm, `inert`
* included): ANY truthy value renders the canonical presence form
* (`disabled="disabled"` → `disabled=""`, `hidden={1}` → `hidden=""`), any
* falsy value REMOVES (`hidden={0}`, `inert=""` → absent) — client, SSR, and
* the compiler's static-literal bake, so differential/hydration byte-compares
* stay stable. This REVERSES the 2026-06 "write values through natively"
* adjudication (2026-07-08, the controlled-components change).
* `checked`/`selected`/`multiple`/`muted` are deliberately NOT here — checked
* routes through the controlled machinery and the other three through
* MUST_USE_PROPERTY_PROPS. `download`/`capture` (the OVERLOADED booleans) are
* handled at the boolean-TYPE branch only — their non-boolean values pass
* through verbatim (`download={0}` → "0", like React). Lowercased; match with
* name.toLowerCase().
*/
var BOOLEAN_ATTR_PROPS$1 = new Set([
	"allowfullscreen",
	"async",
	"autoplay",
	"controls",
	"credentialless",
	"default",
	"defer",
	"disabled",
	"disablepictureinpicture",
	"disableremoteplayback",
	"formnovalidate",
	"hidden",
	"inert",
	"itemscope",
	"loop",
	"nomodule",
	"novalidate",
	"open",
	"playsinline",
	"readonly",
	"required",
	"reversed",
	"scoped",
	"seamless"
]);
/**
* React's mustUseProperty set minus value/checked (owned by the controlled
* machinery): attributes that do NOT reflect to the live DOM property after
* creation — a dynamic `muted={x}` written as an attribute never (un)mutes a
* playing element. The client writes the PROPERTY for dynamic values; static
* literals and SSR keep the attribute (correct initial state). Lowercased.
*/
var MUST_USE_PROPERTY_PROPS$1 = new Set([
	"muted",
	"multiple",
	"selected"
]);
/**
* React's positive-numeric props. Values below 1 (including zero and values
* that do not coerce to a number) are omitted instead of serialized.
*/
var POSITIVE_NUMERIC_ATTR_PROPS$1 = new Set([
	"size",
	"cols",
	"rows",
	"span"
]);
/**
* Tags that exist ONLY in the SVG namespace (no HTML element shares the name),
* so their appearance in a namespace-ambiguous position — a component's root
* template, a value-position descriptor, portal children — implies the SVG
* namespace without a lexical `<svg>` ancestor. Solid/Svelte ship the same
* inference table. Ambiguous names (`a`, `script`, `style`, `title`, `font`)
* are deliberately ABSENT: they stay in the inherited namespace. Consumed by
* the compiler's nsForSelf/nsForChildren (template namespaces baked at compile
* time) and the runtime's de-opt reconciler.
*/
var SVG_ONLY_TAGS$1 = new Set([
	"altGlyph",
	"altGlyphDef",
	"altGlyphItem",
	"animate",
	"animateColor",
	"animateMotion",
	"animateTransform",
	"circle",
	"clipPath",
	"defs",
	"desc",
	"ellipse",
	"feBlend",
	"feColorMatrix",
	"feComponentTransfer",
	"feComposite",
	"feConvolveMatrix",
	"feDiffuseLighting",
	"feDisplacementMap",
	"feDistantLight",
	"feDropShadow",
	"feFlood",
	"feFuncA",
	"feFuncB",
	"feFuncG",
	"feFuncR",
	"feGaussianBlur",
	"feImage",
	"feMerge",
	"feMergeNode",
	"feMorphology",
	"feOffset",
	"fePointLight",
	"feSpecularLighting",
	"feSpotLight",
	"feTile",
	"feTurbulence",
	"filter",
	"font-face",
	"font-face-format",
	"font-face-name",
	"font-face-src",
	"font-face-uri",
	"foreignObject",
	"g",
	"glyph",
	"glyphRef",
	"hkern",
	"image",
	"line",
	"linearGradient",
	"marker",
	"mask",
	"metadata",
	"missing-glyph",
	"mpath",
	"path",
	"pattern",
	"polygon",
	"polyline",
	"radialGradient",
	"rect",
	"set",
	"stop",
	"switch",
	"symbol",
	"text",
	"textPath",
	"tref",
	"tspan",
	"use",
	"view",
	"vkern"
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
* the server's `ssrAttr`, and the compiler's `normalizeJsxAttrName`, which
* bakes static attributes into template/SSR markup. Custom elements are exempt
* everywhere (raw props).
*/
var ATTRIBUTE_ALIASES$1 = new Map([
	["acceptCharset", "accept-charset"],
	["htmlFor", "for"],
	["httpEquiv", "http-equiv"],
	["crossOrigin", "crossorigin"],
	["accentHeight", "accent-height"],
	["alignmentBaseline", "alignment-baseline"],
	["arabicForm", "arabic-form"],
	["baselineShift", "baseline-shift"],
	["capHeight", "cap-height"],
	["clipPath", "clip-path"],
	["clipRule", "clip-rule"],
	["colorInterpolation", "color-interpolation"],
	["colorInterpolationFilters", "color-interpolation-filters"],
	["colorProfile", "color-profile"],
	["colorRendering", "color-rendering"],
	["dominantBaseline", "dominant-baseline"],
	["enableBackground", "enable-background"],
	["fillOpacity", "fill-opacity"],
	["fillRule", "fill-rule"],
	["floodColor", "flood-color"],
	["floodOpacity", "flood-opacity"],
	["fontFamily", "font-family"],
	["fontSize", "font-size"],
	["fontSizeAdjust", "font-size-adjust"],
	["fontStretch", "font-stretch"],
	["fontStyle", "font-style"],
	["fontVariant", "font-variant"],
	["fontWeight", "font-weight"],
	["glyphName", "glyph-name"],
	["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
	["glyphOrientationVertical", "glyph-orientation-vertical"],
	["horizAdvX", "horiz-adv-x"],
	["horizOriginX", "horiz-origin-x"],
	["imageRendering", "image-rendering"],
	["letterSpacing", "letter-spacing"],
	["lightingColor", "lighting-color"],
	["markerEnd", "marker-end"],
	["markerMid", "marker-mid"],
	["markerStart", "marker-start"],
	["overlinePosition", "overline-position"],
	["overlineThickness", "overline-thickness"],
	["paintOrder", "paint-order"],
	["panose-1", "panose-1"],
	["pointerEvents", "pointer-events"],
	["renderingIntent", "rendering-intent"],
	["shapeRendering", "shape-rendering"],
	["stopColor", "stop-color"],
	["stopOpacity", "stop-opacity"],
	["strikethroughPosition", "strikethrough-position"],
	["strikethroughThickness", "strikethrough-thickness"],
	["strokeDasharray", "stroke-dasharray"],
	["strokeDashoffset", "stroke-dashoffset"],
	["strokeLinecap", "stroke-linecap"],
	["strokeLinejoin", "stroke-linejoin"],
	["strokeMiterlimit", "stroke-miterlimit"],
	["strokeOpacity", "stroke-opacity"],
	["strokeWidth", "stroke-width"],
	["textAnchor", "text-anchor"],
	["textDecoration", "text-decoration"],
	["textRendering", "text-rendering"],
	["transformOrigin", "transform-origin"],
	["underlinePosition", "underline-position"],
	["underlineThickness", "underline-thickness"],
	["unicodeBidi", "unicode-bidi"],
	["unicodeRange", "unicode-range"],
	["unitsPerEm", "units-per-em"],
	["vAlphabetic", "v-alphabetic"],
	["vHanging", "v-hanging"],
	["vIdeographic", "v-ideographic"],
	["vMathematical", "v-mathematical"],
	["vectorEffect", "vector-effect"],
	["vertAdvY", "vert-adv-y"],
	["vertOriginX", "vert-origin-x"],
	["vertOriginY", "vert-origin-y"],
	["wordSpacing", "word-spacing"],
	["writingMode", "writing-mode"],
	["xmlnsXlink", "xmlns:xlink"],
	["xHeight", "x-height"],
	["xlinkActuate", "xlink:actuate"],
	["xlinkArcrole", "xlink:arcrole"],
	["xlinkHref", "xlink:href"],
	["xlinkRole", "xlink:role"],
	["xlinkShow", "xlink:show"],
	["xlinkTitle", "xlink:title"],
	["xlinkType", "xlink:type"],
	["xmlBase", "xml:base"],
	["xmlLang", "xml:lang"],
	["xmlSpace", "xml:space"],
	["tabIndex", "tabindex"]
]);
/**
* The three global ENUMERATED attributes whose boolean prop forms must
* stringify: `false` must WRITE "false" (an ABSENT attribute means "inherit /
* UA default", a different state), and `true` writes "true". Applies on every
* element (they're global attributes — custom elements included). Matched
* case-insensitively: JSX arrives camelCase (`spellCheck`), spreads/de-opt
* props may arrive lowercase.
*/
function isEnumeratedBooleanAttr$1(name) {
	switch (name.length) {
		case 10: return name.toLowerCase() === "spellcheck";
		case 9: return name.toLowerCase() === "draggable";
		case 15: return name.toLowerCase() === "contenteditable";
	}
	return false;
}
var UNITLESS_STYLE_PROPS = /* @__PURE__ */ new Set();
for (const base of [
	"animationIterationCount",
	"aspectRatio",
	"borderImageOutset",
	"borderImageSlice",
	"borderImageWidth",
	"boxFlex",
	"boxFlexGroup",
	"boxOrdinalGroup",
	"columnCount",
	"columns",
	"flex",
	"flexGrow",
	"flexPositive",
	"flexShrink",
	"flexNegative",
	"flexOrder",
	"gridArea",
	"gridRow",
	"gridRowEnd",
	"gridRowSpan",
	"gridRowStart",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnSpan",
	"gridColumnStart",
	"fontWeight",
	"lineClamp",
	"lineHeight",
	"opacity",
	"order",
	"orphans",
	"tabSize",
	"widows",
	"zIndex",
	"zoom",
	"fillOpacity",
	"floodOpacity",
	"stopOpacity",
	"strokeDasharray",
	"strokeDashoffset",
	"strokeMiterlimit",
	"strokeOpacity",
	"strokeWidth"
]) {
	const c = base.toLowerCase();
	UNITLESS_STYLE_PROPS.add(c);
	UNITLESS_STYLE_PROPS.add("webkit" + c);
	UNITLESS_STYLE_PROPS.add("ms" + c);
	UNITLESS_STYLE_PROPS.add("moz" + c);
	UNITLESS_STYLE_PROPS.add("o" + c);
}
/** True if `name` (camelCase, kebab, or vendor-prefixed) is a unitless CSS property. */
function isUnitlessStyleProp(name) {
	return UNITLESS_STYLE_PROPS.has(name.replaceAll("-", "").toLowerCase());
}
/**
* Coerce a style-object value to its CSS string, React-style: a bare number gets
* `px` appended — except `0`, custom properties (`--x`), and unitless properties.
* `name` is the ORIGINAL key (any casing); everything else stringifies as-is.
* Shared by the client (`setStyle`), SSR (`ssrStyle`), and the compiler's
* static-object bake so all three agree.
*/
function cssStyleValue$1(name, value) {
	if (typeof value === "number" && value !== 0 && name.charCodeAt(0) !== 45 && !isUnitlessStyleProp(name)) return value + "px";
	return typeof value === "string" ? value.trim() : "" + value;
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
function hyphenateStyleName(name) {
	if (name.charCodeAt(0) === 45) return name;
	let hasUpper = false;
	for (let i = 0; i < name.length; i++) {
		const c = name.charCodeAt(i);
		if (c >= 65 && c <= 90) {
			hasUpper = true;
			break;
		}
	}
	if (!hasUpper) return name;
	let out = "";
	for (let i = 0; i < name.length; i++) {
		const c = name.charCodeAt(i);
		if (c >= 65 && c <= 90) out += "-" + String.fromCharCode(c + 32);
		else out += name[i];
	}
	if (out.charCodeAt(0) === 109 && out.charCodeAt(1) === 115 && out.charCodeAt(2) === 45) out = "-" + out;
	return out;
}
/** Opens a hydratable block (component output / control-flow branch). */
var BLOCK_OPEN = `<!--[-->`;
/** Closes a hydratable block. */
var BLOCK_CLOSE = `<!--]-->`;
/** Opens an @for range whose server render selected @empty. */
var FOR_BLOCK_OPEN_EMPTY = `<!--[f0-->`;
/** Opens an @for range whose server render contains items. */
var FOR_BLOCK_OPEN_ITEMS = `<!--[f1-->`;
/** A bare anchor comment used where the client would otherwise clone a `<!>`. */
var EMPTY_COMMENT = "<!---->";
/**
* Marker attribute on the inline `<script type="application/json">` that the
* server emits to carry the JSON-serialized `use(thenable)` values it resolved
* during render (SSR Suspense). The client `hydrateRoot()` finds this
* script by attribute, parses it, and seeds the values back into `use()` (in
* render order) so a hydrating boundary returns synchronously instead of
* re-suspending. Shared so server emit and client read stay byte-identical.
*/
var SUSPENSE_SCRIPT_ATTR = "data-octane-suspense";
/**
* Prefix for collision-free scalar escapes inside SSR Suspense seed JSON.
* `undefined` is encoded as `${prefix}u`; user strings beginning with the
* prefix are encoded as `${prefix}s${value}` before JSON serialization.
*/
var SUSPENSE_SEED_WIRE_PREFIX = "\0octane:ssr-seed:";
/**
* Top-level envelope key used only when a server hydration-seed stream contains
* rejected `use(thenable)` entries. Keeping rejection metadata outside the
* fulfilled value array prevents user data from colliding with the protocol.
*/
var REJECTION_SENTINEL_KEY = "__octane_new_rejection__";
/**
* Marks a thenable whose hydration value is owned by an external serializer.
* Octane still tracks and unwraps it, but does not emit or consume a duplicate
* suspense seed for that thenable.
*/
var EXTERNAL_HYDRATION_PROMISE = Symbol.for("octane.external-hydration-promise");
/**
* Allows a logical client root to cross SSR ancestors that live outside the
* selected hydration container. The root marks itself `passthrough`; the first
* component whose DOM is inside the container marks itself `owner`.
*/
var HYDRATION_RANGE_BOUNDARY = Symbol.for("octane.hydration-range-boundary");
/** Sentinel <template> attribute marking a pending streamed boundary. */
var STREAM_BOUNDARY_ATTR = "data-oct-b";
/** Hidden segment container attribute carrying a completed boundary's content. */
var STREAM_SEGMENT_ATTR = "data-oct-s";
/** Per-boundary seed-JSON script attribute (inside the segment). */
var STREAM_SEED_ATTR = "data-oct-seed";
/** Renderer-owned executable/data scripts emitted by the streaming protocol. */
var STREAM_SCRIPT_ATTR = "data-octane-stream";
/** Comment-data prefix left in a swapped boundary for hydration seed scoping. */
var STREAM_SEED_COMMENT = "oct-seed:";
/** HTML void elements (no content model). See dom-tables.js. */
var VOID_ELEMENTS = VOID_ELEMENTS$1;
/** React's BOOLEAN attribute props — truthy renders `attr=""`, falsy drops. See dom-tables.js. */
var BOOLEAN_ATTR_PROPS = BOOLEAN_ATTR_PROPS$1;
/** React's mustUseProperty set minus value/checked. See dom-tables.js. */
var MUST_USE_PROPERTY_PROPS = MUST_USE_PROPERTY_PROPS$1;
/**
* React's POSITIVE-numeric props: values below 1 (incl. 0 and non-numeric)
* drop — `size="0"` is invalid per the HTML spec (size must be > 0).
*/
var POSITIVE_NUMERIC_ATTR_PROPS = POSITIVE_NUMERIC_ATTR_PROPS$1;
/**
* Legal HTML attribute name: non-empty, no ASCII whitespace, `"`, `'`, `>`,
* `/`, `=`, or control chars. Rejects spread keys that would inject markup
* (e.g. 'x onload=alert(1)'). Shared by the SSR serializer (ssrAttrEntry) and
* the client's setAttribute (proactive skip — mirrors React's validity gate;
* the platform would throw InvalidCharacterError).
*/
var VALID_ATTR_NAME = /^[^\s"'>\/=\u0000-\u001F]+$/;
/**
* Tags that exist ONLY in the SVG namespace — implies SVG in a
* namespace-ambiguous position. See dom-tables.js.
*/
var SVG_ONLY_TAGS = SVG_ONLY_TAGS$1;
/**
* React 19's attribute-alias table — camelCase JSX prop → the attribute the
* browser actually understands (an ALLOWLIST, not mechanical hyphenation).
* See dom-tables.js.
*/
var ATTRIBUTE_ALIASES = ATTRIBUTE_ALIASES$1;
/**
* The three global ENUMERATED attributes whose boolean prop forms must
* stringify (`spellcheck`/`draggable`/`contenteditable`). See dom-tables.js.
*/
var isEnumeratedBooleanAttr = isEnumeratedBooleanAttr$1;
/**
* Coerce a style-object value to its CSS string, React-style: a bare number gets
* `px` appended — except `0`, custom properties (`--x`), and unitless properties.
* See dom-tables.js.
*/
var cssStyleValue = cssStyleValue$1;
/**
* clsx-style class composition (strings, numbers, arrays, objects, nesting;
* falsy drops out). Octane's `class`/`className` semantics at every apply site.
*/
function normalizeClass(value) {
	if (typeof value === "string") return value;
	if (typeof value !== "object") return typeof value === "number" && value ? "" + value : "";
	if (value === null) return "";
	let str = "";
	if (Array.isArray(value)) for (let i = 0; i < value.length; i++) {
		const item = value[i];
		if (item) {
			const inner = normalizeClass(item);
			if (inner) str = str ? str + " " + inner : inner;
		}
	}
	else for (const k in value) if (value[k]) str = str ? str + " " + k : k;
	return str;
}
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
var styleNameCache = /* @__PURE__ */ new Map();
function styleName(name) {
	const cached = styleNameCache.get(name);
	if (cached !== void 0) return cached;
	const result = hyphenateStyleName(name);
	styleNameCache.set(name, result);
	return result;
}
/**
* Shared URL-attribute sanitizer for client templates, dynamic DOM writes, and
* every server renderer. Keep this regex non-global: repeated updates must
* test independently rather than inheriting RegExp.lastIndex state.
*
* Per React's `react-dom-bindings/src/shared/sanitizeURL.js`, URL parsing drops
* leading C0 controls/spaces and embedded ASCII tabs/newlines before deciding
* whether the scheme is `javascript:`.
*/
var IS_JAVASCRIPT_PROTOCOL = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*\:/i;
var BLOCKED_JAVASCRIPT_URL = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
var RESERVED_HYPHENATED_NATIVE_TAGS = new Set([
	"annotation-xml",
	"color-profile",
	"font-face",
	"font-face-src",
	"font-face-uri",
	"font-face-format",
	"font-face-name",
	"missing-glyph"
]);
/**
* Replace a script-bearing URL with React's inert diagnostic URL.
*
* Callers deliberately pass an already-coerced string so values with an
* observable `toString()` are evaluated exactly once across validation,
* hydration comparison, and the final write.
*/
function sanitizeURL(url) {
	return IS_JAVASCRIPT_PROTOCOL.test(url) ? BLOCKED_JAVASCRIPT_URL : url;
}
/**
* Whether a native host attribute is one of React DOM's navigable URL sinks.
* Custom elements retain React 19's raw attribute semantics. `data` is a URL
* only on `<object>`; arbitrary `data` attributes remain ordinary text.
*/
function shouldSanitizeURLAttribute(tag, name) {
	tag = tag === void 0 ? void 0 : tag.toLowerCase();
	if (tag !== void 0 && tag.includes("-") && !RESERVED_HYPHENATED_NATIVE_TAGS.has(tag)) return false;
	name = name.toLowerCase();
	return name === "src" || name === "href" || name === "action" || name === "formaction" || name === "xlink:href" || name === "xlinkhref" || name === "data" && tag === "object";
}
/** Sanitize an already-coerced value when `(tag, name)` is a URL sink. */
function sanitizeURLAttribute(tag, name, value) {
	return shouldSanitizeURLAttribute(tag, name) ? sanitizeURL(value) : value;
}
var OCTANE_COMPONENT_FLAGS = Symbol.for("octane.flags.component");
/** Attach an immutable capability bitmask without retaining concrete component identities. */
function markComponentFlags(component, flags, name) {
	Object.defineProperty(component, OCTANE_COMPONENT_FLAGS, { value: flags });
	Object.defineProperty(component, "name", {
		value: name,
		configurable: true
	});
	return component;
}
/** Test compiler/runtime capability bits on a component from any Octane runtime copy. */
function hasComponentFlags(component, flags) {
	return typeof component === "function" && Object.hasOwn(component, OCTANE_COMPONENT_FLAGS) && (component[OCTANE_COMPONENT_FLAGS] & flags) === flags;
}
/**
* octane server runtime (SSR).
*
* The `octane/compiler` compiler, in `mode: 'server'`, emits component bodies
* that build an HTML STRING (instead of cloning a DOM template) by calling the
* `ssr*` helpers here, and that call these server hook implementations. The
* server analogues of `createRoot().render()` are `renderToString` /
* `renderToStaticMarkup` (`octane/server`) and `prerender` (`octane/static`),
* each returning `{ html, css }` (hoisted head folded into `html`).
*
* Scope: static markup, dynamic text holes, attributes (incl. class / style /
* spread), control flow (@if/@for/@switch/@try), nested components, scoped CSS
* collection, Suspense, and the leaf hooks (state renders its initial value —
* re-invoking the body for render-phase dispatches until it settles, as React's
* server renderer does — effects no-op, memo runs once, ids are deterministic).
* Every dynamic site is
* wrapped in the hydration markers (`constants.ts`) the client `hydrateRoot`
* cursor adopts. Events and refs are dropped (no DOM on the server); fragment
* refs (`<Fragment ref={…}>`) are rejected by the compiler in server mode.
*/
var SVG_ONLY_LOWERCASE_TAGS = new Set(Array.from(SVG_ONLY_TAGS, (tag) => tag.toLowerCase()));
var CURRENT_SCOPE = null;
var ACTIVE_PU_WARM_PLANS = [];
var CURRENT_PU_WARM_CLAIMS = null;
var ID_COUNTER = 0;
var ID_PREFIX = "";
var CSS = null;
var NONCE_ATTR = "";
var MARKERS = true;
var HEAD = null;
var SUSPENDED = null;
var RESOLVED = null;
var SERIAL = null;
var FRAME = null;
var DEFERRED = null;
var CURRENT_COMP = null;
var CURRENT_PROPS = null;
var CURRENT_PARENT_SCOPE = null;
var ASYNC_SCOPE = "";
var CURRENT_SSR_ELEMENT = null;
var SSR_NESTING_WARNINGS = null;
function framePath(f) {
	if (f.path !== null) return f.path;
	const p = f.parent === null ? "" : framePath(f.parent) + "/" + f.seg;
	f.path = p;
	return p;
}
function asyncFramePath(frame) {
	return (frame === null ? "" : framePath(frame)) + ASYNC_SCOPE;
}
function nextFrameOccurrence(frame, base) {
	if (frame.occ === null) frame.occ = /* @__PURE__ */ new Map();
	const scopedBase = ASYNC_SCOPE === frame.asyncScope ? base : ASYNC_SCOPE + "\0" + base;
	const next = frame.occ.get(scopedBase) ?? 0;
	frame.occ.set(scopedBase, next + 1);
	return next;
}
function nextChildSegment(frame) {
	if (ASYNC_SCOPE === frame.asyncScope) return frame.nextChild++;
	if (frame.scopedChildren === null) frame.scopedChildren = /* @__PURE__ */ new Map();
	const next = frame.scopedChildren.get(ASYNC_SCOPE) ?? 0;
	frame.scopedChildren.set(ASYNC_SCOPE, next + 1);
	return next;
}
function ssrScope(parent) {
	return {
		parent,
		$$ctxValues: null
	};
}
function parserNamespacesForTag(tag, inherited) {
	const semanticTag = tag.toLowerCase();
	return {
		namespace: semanticTag === "svg" ? "svg" : semanticTag === "math" ? "mathml" : inherited === "html" && SVG_ONLY_LOWERCASE_TAGS.has(semanticTag) ? "svg" : inherited,
		childrenNamespace: semanticTag === "foreignobject" ? "html" : semanticTag === "svg" ? "svg" : semanticTag === "math" ? "mathml" : inherited === "html" && SVG_ONLY_LOWERCASE_TAGS.has(semanticTag) ? "svg" : inherited
	};
}
function ssrElementNamespaces(tag, parent) {
	return parserNamespacesForTag(tag, parent?.childrenNamespace ?? FRAME?.namespace ?? "html");
}
var NOOP = () => {};
var ELEMENT_TAG = Symbol.for("octane.element");
var PORTAL_TAG = Symbol.for("octane.portal");
/**
* React-compatible Fragment sentinel. Value-position `<Fragment>` sites compile
* to ordinary element descriptors in both modes; ssrChild recognizes this type
* and flattens its children with the same wrapper/key rules as the client.
*/
var Fragment = Symbol.for("octane.Fragment");
function hasElementConfigKey(config) {
	if (config == null || typeof config !== "object" && typeof config !== "function") return false;
	const own = Object.getOwnPropertyDescriptor(config, "key");
	if (own?.get != null && own.get.isReactWarning) return false;
	return config.key !== void 0;
}
function copyElementConfig(config) {
	const props = {};
	if (config == null) return props;
	for (const name in config) if (name !== "key" && Object.prototype.hasOwnProperty.call(config, name)) props[name] = config[name];
	return props;
}
function applyElementDefaultProps(type, props) {
	const defaults = type?.defaultProps;
	if (defaults == null) return;
	for (const name in defaults) if (props[name] === void 0) props[name] = defaults[name];
}
function finalizeElementDescriptor(descriptor) {
	return descriptor;
}
function createElement(type, props, ...children) {
	const src = props ?? null;
	const key = hasElementConfigKey(src) ? "" + src.key : null;
	let kids = children.length > 0 ? children.length === 1 ? children[0] : children : src?.children;
	if (children.length > 1) POSITIONAL_CHILDREN.add(children);
	if (children.length > 1 && false);
	const p = copyElementConfig(src);
	if (children.length > 0) p.children = kids;
	applyElementDefaultProps(type, p);
	kids = p.children;
	return finalizeElementDescriptor({
		$$kind: ELEMENT_TAG,
		type,
		props: p,
		key,
		ref: p.ref !== void 0 ? p.ref : null,
		children: kids ?? null
	});
}
var POSITIONAL_CHILDREN = /* @__PURE__ */ new WeakSet();
function isElementDescriptor(v) {
	return v != null && v.$$kind === ELEMENT_TAG;
}
function isFragmentDescriptor(value) {
	return isElementDescriptor(value) && value.type === Fragment;
}
function fragmentDescriptorChildren(value) {
	const children = value.children;
	if (children == null) return [];
	return Array.isArray(children) ? children : [children];
}
function ssrDeoptWrapperKind(value) {
	return POSITIONAL_CHILDREN.has(value) ? "fragment" : "array";
}
function ssrDeoptKey(item, index) {
	return isElementDescriptor(item) && item.key != null ? item.key : index;
}
function scopedSsrDeoptKey(path, item, index, key) {
	const explicit = isElementDescriptor(item) && item.key != null;
	return JSON.stringify([
		path,
		explicit ? "key" : "index",
		explicit ? String(key) : index
	]);
}
function flattenSsrChildContainer(outItems, outKeys, children, kind, path) {
	const count = children.length;
	for (let i = 0; i < count; i++) {
		const item = children[i];
		if (isFragmentDescriptor(item)) {
			const nested = fragmentDescriptorChildren(item);
			if (item.key != null) flattenSsrChildContainer(outItems, outKeys, nested, "fragment", [
				...path,
				"keyed-fragment",
				item.key
			]);
			else flattenSsrChildContainer(outItems, outKeys, nested, "fragment", kind === "fragment" ? [
				...path,
				"wrapper",
				count === 1 ? 0 : i
			] : count === 1 ? path : [
				...path,
				"position",
				i,
				"fragment"
			]);
			continue;
		}
		if (Array.isArray(item)) {
			const nestedKind = ssrDeoptWrapperKind(item);
			flattenSsrChildContainer(outItems, outKeys, item, nestedKind, nestedKind === kind ? [
				...path,
				"wrapper",
				count === 1 ? 0 : i
			] : count === 1 ? path : [
				...path,
				"position",
				i,
				nestedKind
			]);
			continue;
		}
		outItems.push(item);
		outKeys.push(scopedSsrDeoptKey(path, item, i, ssrDeoptKey(item, i)));
	}
}
function prepareSsrDeoptList(value, includeKeyedSingle) {
	const items = [];
	const keys = [];
	if (isFragmentDescriptor(value)) {
		const path = value.key == null ? [] : ["keyed-fragment", value.key];
		flattenSsrChildContainer(items, keys, fragmentDescriptorChildren(value), "fragment", path);
		return {
			items,
			keys
		};
	}
	if (Array.isArray(value)) {
		flattenSsrChildContainer(items, keys, value, ssrDeoptWrapperKind(value), []);
		return {
			items,
			keys
		};
	}
	if (includeKeyedSingle && isElementDescriptor(value) && value.key != null) {
		items.push(value);
		keys.push(scopedSsrDeoptKey([], value, 0, value.key));
		return {
			items,
			keys
		};
	}
	return null;
}
function childrenIterator(children) {
	if (children == null || typeof children !== "object") return null;
	const iterator = typeof Symbol === "function" && children[Symbol.iterator] || children["@@iterator"];
	return typeof iterator === "function" ? iterator : null;
}
function iterableChildArray(value) {
	if (value == null || typeof value === "string" || Array.isArray(value) || isElementDescriptor(value)) return null;
	const iterator = childrenIterator(value);
	if (iterator === null) return null;
	const out = [];
	const cursor = iterator.call(value);
	let step;
	while (!(step = cursor.next()).done) out.push(step.value);
	return out;
}
function describeObjectForError(value) {
	let rendered;
	try {
		rendered = String(value);
	} catch {
		return "object with keys {" + Object.keys(value).join(", ") + "}";
	}
	return rendered === "[object Object]" ? "object with keys {" + Object.keys(value).join(", ") + "}" : rendered;
}
function invalidChildError(child) {
	const found = describeObjectForError(child);
	return /* @__PURE__ */ new Error("Objects are not valid as an Octane child (found: " + found + "). If you meant to render a collection of children, use an array instead.");
}
var HTML_ESCAPE_RE = /[&<>]/g;
function escapeHtml(v) {
	const s = typeof v === "string" ? v : String(v);
	HTML_ESCAPE_RE.lastIndex = 0;
	if (!HTML_ESCAPE_RE.test(s)) return s;
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
var ATTR_ESCAPE_RE = /[&"]/g;
function escapeAttr(v) {
	const s = typeof v === "string" ? v : String(v);
	ATTR_ESCAPE_RE.lastIndex = 0;
	if (!ATTR_ESCAPE_RE.test(s)) return s;
	return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
var DANGER_HTML_CHILD_PROBE = 0;
function probingDangerHtmlChild(value) {
	if (DANGER_HTML_CHILD_PROBE === 0) return false;
	if (value !== null && value !== void 0) throw new Error("Can only set one of `children` or `props.dangerouslySetInnerHTML`.");
	return true;
}
/** A dynamic text hole. null/false/undefined render as empty (React parity). */
function ssrText(v) {
	if (probingDangerHtmlChild(v)) return "";
	if (v == null || v === false) return "";
	return escapeHtml(v);
}
function ssrComponentDescriptor(d, scope) {
	return ssrComponent(scope, d.type, {
		...d.props,
		children: d.children ?? d.props?.children
	});
}
/**
* A RENDERABLE expression hole — the value of a `{expr}` that is NOT marked as
* definite text (`{expr as string}`). Mirrors Ripple: a `{children}` / component
* function or element descriptor RENDERS (wrapped in a hydration block range, so
* the client adopts it), while a primitive coerces to text. The compiler routes
* `{x as string}` / literals / `+`-concats to `ssrText`, everything else here.
*/
function ssrChild(v, scope) {
	if (probingDangerHtmlChild(v)) return "";
	return ssrChildValue(v, scope, true);
}
function ssrChildValue(v, scope, includeKeyedSingle) {
	if (v == null || v === false || v === true) return ssrBlock("");
	if ((typeof v === "object" || typeof v === "function") && (v.$$kind === CONTEXT_TAG || typeof v.then === "function")) return ssrChildValue(use(v), scope, includeKeyedSingle);
	const iterable = iterableChildArray(v);
	if (iterable !== null) v = iterable;
	const preparedList = prepareSsrDeoptList(v, includeKeyedSingle);
	if (preparedList !== null) return withAsyncListScope("child", () => {
		let out = "";
		for (let i = 0; i < preparedList.items.length; i++) {
			const item = preparedList.items[i];
			const key = preparedList.keys[i];
			out += withAsyncIdentity("item", key, () => ssrChildValue(item, scope, false));
		}
		return ssrBlock(out);
	});
	if (typeof v === "function") return ssrComponent(scope, v, {}, void 0, void 0, true);
	if (typeof v === "object") {
		if (v.$$kind === ELEMENT_TAG) {
			const d = v;
			const render = () => {
				if (typeof d.type === "string") return ssrBlock(ssrHostElement(d.type, d.props, d.children, scope));
				return ssrComponentDescriptor(d, scope);
			};
			const renderType = () => withAsyncIdentity("child-type", d.type, render);
			return d.key != null ? withAsyncIdentity("child-key", d.key, renderType, true) : renderType();
		}
		if (v.$$kind === PORTAL_TAG) return ssrBlock(ssrPortal());
		throw invalidChildError(v);
	}
	return ssrBlock(escapeHtml(v));
}
function ssrChildText(v, scope) {
	if (probingDangerHtmlChild(v)) return "";
	if (v == null || v === false || v === true) return "";
	if (typeof v === "object" || typeof v === "function") return ssrChild(v, scope);
	return escapeHtml(v);
}
function ssrHostElement(tag, props, children, scope, rawInner) {
	if (!VALID_TAG_NAME.test(tag)) throw new Error("Invalid tag: " + tag);
	const semanticTag = tag.toLowerCase();
	const parentElement = CURRENT_SSR_ELEMENT;
	const { namespace, childrenNamespace } = ssrElementNamespaces(semanticTag, parentElement);
	CURRENT_SSR_ELEMENT = {
		tag: semanticTag,
		parent: parentElement,
		namespace,
		childrenNamespace,
		location: void 0
	};
	try {
		const iterable = iterableChildArray(children);
		const iterableChildren = iterable !== null;
		if (iterable !== null) children = iterable;
		let attrs = "";
		let innerHTMLValue = void 0;
		let hasInnerHTMLProp = false;
		const isCtlTag = semanticTag === "input" || semanticTag === "textarea" || semanticTag === "select";
		if (props != null) {
			for (const k in props) {
				const val = props[k];
				if (k === "dangerouslySetInnerHTML") {
					hasInnerHTMLProp = true;
					innerHTMLValue = val;
					continue;
				}
				if (isCtlTag && (k === "value" || k === "defaultValue" || semanticTag === "input" && (k === "checked" || k === "defaultChecked"))) continue;
				attrs += ssrAttrEntry(k, val, semanticTag, namespace);
			}
			if (semanticTag === "input") {
				attrs += ssrValueAttr(props.value != null ? props.value : props.defaultValue);
				attrs += ssrCheckedAttr(props.checked != null ? props.checked : props.defaultChecked);
			}
		}
		const hasChildren = rawInner !== void 0 ? rawInner !== "" : children != null && children !== false && children !== true && children !== "";
		if (hasInnerHTMLProp && innerHTMLValue != null && (typeof innerHTMLValue !== "object" || !("__html" in innerHTMLValue))) throw new Error("`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`");
		const hasDangerHTML = hasInnerHTMLProp && innerHTMLValue != null;
		if (hasDangerHTML && (children != null || rawInner !== void 0 && rawInner !== "")) throw new Error("Can only set one of `children` or `props.dangerouslySetInnerHTML`.");
		if (semanticTag === "textarea" && props != null && (props.value != null || props.defaultValue != null)) {
			if (hasChildren && props.value == null) throw new Error("If you supply `defaultValue` on a <textarea>, do not pass children.");
			const inner = ssrTextareaValue(props.value != null ? props.value : props.defaultValue);
			return "<" + tag + attrs + ">" + inner + "</" + tag + ">";
		}
		if (VOID_ELEMENTS.has(semanticTag) && hasDangerHTML) throw new Error(`\`${semanticTag}\` is a void element tag and must neither have \`children\` nor use \`dangerouslySetInnerHTML\`.`);
		if (VOID_ELEMENTS.has(semanticTag) && !hasChildren) return "<" + tag + attrs + "/>";
		let inner = "";
		if (hasDangerHTML) {
			const html = innerHTMLValue.__html;
			const raw = html == null ? "" : String(html);
			inner = semanticTag === "script" ? escapeEntireInlineScriptContent(raw) : semanticTag === "style" ? escapeEntireInlineStyleContent(raw) : raw;
		} else if (rawInner !== void 0) inner = rawInner;
		else if (hasChildren) {
			const build = () => ssrInNamespace(childrenNamespace, () => iterableChildren || serverDescNeedsBlocks(children) ? ssrDeoptBlockChildren(children, scope) : ssrDescriptorContent(children, scope));
			inner = semanticTag === "select" && props != null && (props.value != null || props.defaultValue != null) ? ssrSelectScope(props.value, props.defaultValue, !!props.multiple, build) : build();
		}
		if (semanticTag === "option") return ssrOption(props != null && props.value != null ? props.value : void 0, attrs, inner);
		return "<" + tag + attrs + ">" + inner + "</" + tag + ">";
	} finally {
		CURRENT_SSR_ELEMENT = parentElement;
	}
}
function ssrDeoptBlockChildren(children, scope) {
	const iterable = iterableChildArray(children);
	if (iterable !== null) children = iterable;
	const preparedList = prepareSsrDeoptList(children, true);
	if (preparedList !== null) return withAsyncListScope("host-child", () => {
		let out = "";
		for (let i = 0; i < preparedList.items.length; i++) {
			const item = preparedList.items[i];
			const key = preparedList.keys[i];
			out += withAsyncIdentity("item", key, () => {
				return serverDescNeedsBlocks(item) ? ssrChildValue(item, scope, false) : ssrBlock(ssrDescriptorContent(item, scope));
			});
		}
		return ssrBlock(out);
	});
	return ssrChild(children, scope);
}
function serverDescNeedsBlocks(v) {
	if (v == null || typeof v !== "object") return false;
	if (Array.isArray(v)) {
		for (let i = 0; i < v.length; i++) if (serverDescNeedsBlocks(v[i])) return true;
		return false;
	}
	if (!isElementDescriptor(v) && childrenIterator(v) !== null) return true;
	const d = v;
	if (d.$$kind === ELEMENT_TAG) {
		if (d.type === Fragment) return true;
		return typeof d.type === "function" || serverDescNeedsBlocks(d.children);
	}
	return false;
}
function ssrDescriptorContent(v, scope) {
	if (v == null || v === false || v === true || v === "") return "";
	if (Array.isArray(v)) {
		let out = "";
		for (let i = 0; i < v.length; i++) out += ssrDescriptorContent(v[i], scope);
		return out;
	}
	if (typeof v === "object" && v.$$kind === ELEMENT_TAG) {
		const d = v;
		if (typeof d.type === "string") return ssrHostElement(d.type, d.props, d.children, scope);
		return ssrComponentDescriptor(d, scope);
	}
	if (typeof v === "function") return ssrComponent(scope, v, {}, void 0, void 0, isChildrenBlock(v));
	if (typeof v === "object") throw invalidChildError(v);
	return escapeHtml(v);
}
/**
* Wrap a control-flow branch / for-item's HTML in hydration block markers
* (`<!--[-->` … `<!--]-->`), so a future client hydrate cursor can find the
* block boundaries and adopt the chosen branch. Mirrors Ripple's marker
* protocol (shared constants in ./constants).
*/
function ssrBlock(content) {
	return MARKERS ? BLOCK_OPEN + content + BLOCK_CLOSE : content;
}
/**
* Wrap an @for in its single outer pair and encode which arm the server chose.
* Markerless direct-host items make populated content indistinguishable from a
* single-root @empty arm otherwise; one bit on the existing open comment lets
* hydration recover server/client list-shape mismatches without extra nodes.
*/
function ssrForBlock(content, hasItems) {
	return MARKERS ? (hasItems ? FOR_BLOCK_OPEN_ITEMS : FOR_BLOCK_OPEN_EMPTY) + content + BLOCK_CLOSE : content;
}
function encodeAsyncIdentityString(value) {
	let encoded = "";
	for (let i = 0; i < value.length; i++) encoded += value.charCodeAt(i).toString(16).padStart(4, "0");
	return encoded;
}
function asyncIdentityKey(value, objectIs, positionFallback) {
	switch (typeof value) {
		case "string": return "s" + encodeAsyncIdentityString(value);
		case "number": return "n" + (objectIs && Object.is(value, -0) ? "-0" : String(value));
		case "bigint": return "i" + String(value);
		case "boolean": return value ? "b1" : "b0";
		case "undefined": return "u";
		case "symbol":
		case "function":
		case "object": {
			if (value === null) return "l";
			const ids = RESOLVED?.asyncIdentities;
			if (ids === void 0) return "o" + encodeAsyncIdentityString(String(value));
			let id = ids.get(value);
			if (id === void 0) {
				id = positionFallback === void 0 ? void 0 : RESOLVED.asyncPositionIdentities.get(positionFallback);
				if (id === void 0) id = RESOLVED.nextAsyncIdentity++;
				ids.set(value, id);
			}
			if (positionFallback !== void 0) RESOLVED.asyncPositionIdentities.set(positionFallback, id);
			return "o" + id.toString(36);
		}
	}
}
function withAsyncIdentity(siteKey, identity, fn, objectIs = false, positionFallback) {
	const prev = ASYNC_SCOPE;
	ASYNC_SCOPE = prev + "|@" + siteKey + ":" + asyncIdentityKey(identity, objectIs, positionFallback);
	try {
		return fn();
	} finally {
		ASYNC_SCOPE = prev;
	}
}
function withAsyncListScope(kind, fn) {
	const frame = FRAME;
	const occurrence = frame === null ? 0 : nextFrameOccurrence(frame, "@list:" + kind);
	return withAsyncIdentity("list:" + kind, occurrence, fn);
}
/** Compiler-emitted identity membrane for one @if/@switch/@for instance. */
function ssrControl(siteKey, fn) {
	const frame = FRAME;
	const occurrence = frame === null ? 0 : nextFrameOccurrence(frame, "@control:" + siteKey);
	return withAsyncIdentity("control:" + siteKey, occurrence, fn);
}
/** Compiler-emitted identity membrane for one arm/item inside ssrControl. */
function ssrArm(armKey, fn) {
	const frame = FRAME;
	const occurrence = frame === null ? 0 : nextFrameOccurrence(frame, "@arm-position:" + ASYNC_SCOPE);
	return withAsyncIdentity("arm", armKey, fn, false, ASYNC_SCOPE + "|@arm-position:" + occurrence);
}
/**
* A portal's site marker. The portal body renders into a foreign target at the
* client, so server-side it leaves a single anchor comment placeholder.
*/
function ssrPortal() {
	return EMPTY_COMMENT;
}
function resolveAttributeNamespace(namespace) {
	return namespace === "opaque" ? FRAME?.namespace ?? "html" : namespace;
}
/**
* A dynamic attribute: ` name="value"`, ` name` for `true`, or '' to omit.
* `tag` and `namespace` (when the emit site knows them) gate the tag-sensitive
* React-parity rules: HTML custom elements get RAW attribute
* semantics (no alias, no value tables), and the empty-URL strip exempts
* `<a>`/`<area>` href. Mirrors the client's setAttribute policies (runtime.ts).
*/
function ssrAttr(name, v, tag, namespace = "html") {
	namespace = resolveAttributeNamespace(namespace);
	const isCustomTag = namespace === "html" && tag !== void 0 && tag.indexOf("-") !== -1;
	if (!isCustomTag) {
		const alias = ATTRIBUTE_ALIASES.get(name);
		if (alias !== void 0) name = alias;
	}
	if (name === "class") {
		if (v == null || v === false) return "";
		return " class=\"" + escapeAttr(normalizeClass(v)) + "\"";
	}
	if (name.charCodeAt(0) === 97 && name.startsWith("aria-")) {
		if (v == null) return "";
		return " " + name + "=\"" + escapeAttr(String(v)) + "\"";
	}
	if (name === "suppressContentEditableWarning" || name === "suppressHydrationWarning" || name === "suppressNativeChangeWarning" || name === "__octaneNativeChangeDiagnostic") return "";
	const t = typeof v;
	if (t === "boolean" && isEnumeratedBooleanAttr(name)) return " " + name + "=\"" + v + "\"";
	if (t === "boolean" && name.startsWith("data-")) return " " + name + "=\"" + v + "\"";
	if (t === "function" || t === "symbol") return "";
	if (!isCustomTag) {
		if (name.length > 2 && name.charCodeAt(0) === 111 && name.charCodeAt(1) === 110) return "";
		const lower = name.toLowerCase();
		if (BOOLEAN_ATTR_PROPS.has(lower)) return v ? " " + lower + "=\"\"" : "";
		if (t === "boolean" && (lower === "download" || lower === "capture")) return v ? " " + lower + "=\"\"" : "";
		if (MUST_USE_PROPERTY_PROPS.has(lower)) return v ? " " + lower + "=\"\"" : "";
		if (t === "boolean") return "";
		if (POSITIVE_NUMERIC_ATTR_PROPS.has(lower) && !(Number(v) >= 1)) return "";
	}
	if (v == null || v === false) return "";
	const s = v === true ? "" : String(v);
	if (s === "" && (name === "src" || name === "href" && tag !== void 0 && tag !== "a" && tag !== "area" || name === "data" && tag === "object")) return "";
	if (v === true) return " " + name;
	return " " + name + "=\"" + escapeAttr(sanitizeURLAttribute(tag, name, s)) + "\"";
}
function styleObjectToCss(obj) {
	let out = "";
	for (const k in obj) {
		const val = obj[k];
		if (val == null || typeof val === "boolean") continue;
		out += styleName(k) + ":" + cssStyleValue(k, val) + ";";
	}
	return out;
}
/** A dynamic `style` attribute (string cssText or an object). */
function ssrStyle(v) {
	if (v == null || v === false || v === "") return "";
	const css = typeof v === "string" ? v : styleObjectToCss(v);
	if (!css) return "";
	return " style=\"" + escapeAttr(css) + "\"";
}
var VALID_TAG_NAME = /^[a-zA-Z][a-zA-Z0-9:._-]*$/;
function ssrAttrEntry(k, v, tag, namespace = "html") {
	namespace = resolveAttributeNamespace(namespace);
	if (k === "key" || k === "ref" || k === "children") return "";
	if (k === "suppressHydrationWarning" || k === "suppressContentEditableWarning" || k === "suppressNativeChangeWarning" || k === "__octaneNativeChangeDiagnostic") return "";
	if (k.length > 2 && k[0] === "o" && k[1] === "n" && k[2] >= "A" && k[2] <= "Z") return "";
	if (k === "autoFocus" && (namespace !== "html" || tag === void 0 || tag.indexOf("-") === -1)) return "";
	if (typeof v === "function" || typeof v === "symbol") return "";
	if (k === "style") return ssrStyle(v);
	if (k === "className" || k === "class") return ssrAttr("class", v, tag, namespace);
	if (VALID_ATTR_NAME.test(k)) return ssrAttr(k, v, tag, namespace);
	return "";
}
function normalizeSsrAttributeName(name, tag, namespace) {
	namespace = resolveAttributeNamespace(namespace);
	if (name === "className") return "class";
	if (!(namespace === "html" && tag !== void 0 && tag.indexOf("-") !== -1)) return ATTRIBUTE_ALIASES.get(name) ?? name;
	return name;
}
function isAggregatedFormAttribute(tag, name) {
	if (name === "value" || name === "defaultValue") return tag === "input" || tag === "textarea" || tag === "select";
	if (tag === "input" && (name === "checked" || name === "defaultChecked")) return true;
	return tag === "select" && name === "multiple";
}
/**
* Resolve all serializable attributes across direct JSX writers and spread
* snapshots. HTML parsers keep the first duplicate attribute, while JSX props
* use last-write wins; collecting by the normalized native name before
* serialization keeps server markup aligned with client application. Repeated
* writes of the same JSX prop retain its first insertion position like
* Object.assign. Distinct aliases that target one native attr still choose the
* latest authored writer and retain that winning prop's insertion position.
*/
function ssrAttrs(sources, tag, namespace = "html", skipFormControls = false) {
	namespace = resolveAttributeNamespace(namespace);
	const props = /* @__PURE__ */ new Map();
	let sourceOrder = 0;
	const record = (rawName, value) => {
		if (typeof rawName !== "string") return;
		const order = sourceOrder++;
		const previous = props.get(rawName);
		props.set(rawName, {
			rawName,
			value,
			firstOrder: previous?.firstOrder ?? order,
			lastOrder: order
		});
	};
	for (const [isSpread, sourceOrName, directValue] of sources) {
		if (!isSpread) {
			record(sourceOrName, directValue);
			continue;
		}
		const source = sourceOrName;
		if (source == null || typeof source !== "object" && typeof source !== "function") continue;
		for (const name of Object.keys(Object(source))) record(name, source[name]);
	}
	const resolved = /* @__PURE__ */ new Map();
	for (const writer of props.values()) {
		const { rawName, value, firstOrder, lastOrder } = writer;
		if (rawName === "key" || rawName === "ref" || rawName === "children" || rawName === "dangerouslySetInnerHTML" || rawName === "suppressHydrationWarning" || rawName === "suppressContentEditableWarning" || rawName === "suppressNativeChangeWarning" || rawName === "__octaneNativeChangeDiagnostic") continue;
		if (skipFormControls && isAggregatedFormAttribute(tag, rawName)) continue;
		if (rawName.length > 2 && rawName[0] === "o" && rawName[1] === "n") {
			const c = rawName.charCodeAt(2);
			if (c >= 65 && c <= 90) continue;
		}
		if (rawName === "autoFocus" && (namespace !== "html" || tag === void 0 || tag.indexOf("-") === -1)) continue;
		const name = normalizeSsrAttributeName(rawName, tag, namespace);
		if (!VALID_ATTR_NAME.test(name)) continue;
		const identity = namespace === "html" ? name.toLowerCase() : name;
		const previous = resolved.get(identity);
		if (previous === void 0 || previous[3] < lastOrder) resolved.set(identity, [
			name,
			value,
			firstOrder,
			lastOrder
		]);
	}
	let out = "";
	const ordered = [...resolved.values()].sort((a, b) => a[2] - b[2]);
	for (const [name, value] of ordered) out += ssrAttrEntry(name, value, tag, namespace);
	return out;
}
/**
* Snapshot one JSX spread with Object.assign semantics. Only own enumerable
* string keys participate, and getters run once at the spread's authored
* evaluation position before later direct prop expressions.
*/
function ssrSnapshotSpread(obj) {
	if (obj == null) return null;
	const source = Object(obj);
	const snapshot = Object.create(null);
	for (const key of Reflect.ownKeys(source)) {
		if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
		const value = source[key];
		if (typeof key === "string") snapshot[key] = value;
	}
	return snapshot;
}
function ssrInnerHtml(sources, renderChildren, definitelyHasChildren = false, childrenSources = []) {
	for (let i = sources.length - 1; i >= 0; i--) {
		const [present, value] = sources[i];
		if (!present) continue;
		if (value == null) return void 0;
		if (typeof value !== "object" || !("__html" in value)) throw new Error("`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`");
		let childValue;
		let hasChildSource = false;
		for (let childI = childrenSources.length - 1; childI >= 0; childI--) {
			if (!childrenSources[childI][0]) continue;
			hasChildSource = true;
			childValue = childrenSources[childI][1];
			break;
		}
		if (definitelyHasChildren || hasChildSource && childValue != null) throw new Error("Can only set one of `children` or `props.dangerouslySetInnerHTML`.");
		if (renderChildren !== void 0) {
			DANGER_HTML_CHILD_PROBE++;
			try {
				renderChildren();
			} finally {
				DANGER_HTML_CHILD_PROBE--;
			}
		}
		const html = value.__html;
		return html == null ? "" : String(html);
	}
}
var INLINE_STYLE_TOKEN = /(<\/|<)(s)(tyle)/gi;
function escapeEntireInlineStyleContent(value) {
	return value.replace(INLINE_STYLE_TOKEN, (_match, prefix, s, suffix) => `${prefix}${s === "s" ? "\\73 " : "\\53 "}${suffix}`);
}
var INLINE_SCRIPT_TOKEN = /(<\/|<)(s)(cript)/gi;
function escapeEntireInlineScriptContent(value) {
	return value.replace(INLINE_SCRIPT_TOKEN, (_match, prefix, s, suffix) => `${prefix}${s === "s" ? "\\u0073" : "\\u0053"}${suffix}`);
}
/**
* Resolve source-ordered `dangerouslySetInnerHTML` writers for a script and make
* the resulting whole-script body safe to concatenate into an HTML response.
* `undefined` still means "no writer", preserving the normal children fallback.
*/
function ssrScriptInnerHtml(sources, renderChildren, definitelyHasChildren = false, childrenSources = []) {
	const html = ssrInnerHtml(sources, renderChildren, definitelyHasChildren, childrenSources);
	return html === void 0 ? void 0 : escapeEntireInlineScriptContent(html);
}
function finalPresentSource(sources) {
	for (let i = sources.length - 1; i >= 0; i--) if (sources[i][0]) return [true, sources[i][1]];
	return [false, void 0];
}
/**
* Render the effective direct/spread `children` prop for an otherwise empty
* host. Prop-driven content is the host's sole child, so primitive text stays
* markerless while descriptors/lists retain the normal child-slot framing.
*/
function ssrChildrenSources(sources, renderFallback, scope) {
	const child = finalPresentSource(sources);
	return child[0] ? ssrChildText(child[1], scope) : renderFallback();
}
/**
* The `value` attribute for a controlled/default `<input>` value. Mirrors the
* client's toControlledString exactly — `value={false}` serializes "false"
* (the generic ssrAttr would DROP a false boolean); only nullish omits.
*/
function ssrValueAttr(v) {
	if (v == null) return "";
	return " value=\"" + escapeAttr(typeof v === "string" ? v : String(v)) + "\"";
}
/** The `checked` attribute (presence semantics; mirrors setChecked's `!!v`). */
function ssrCheckedAttr(v) {
	return v == null || !v ? "" : " checked";
}
/**
* Controlled `<textarea>` content: escaped text + the leading-newline guard
* (the parser eats a '\n' right after the opening tag — see ssrTextPre).
* Mirrors the client's toControlledString (booleans/numbers stringify).
*/
function ssrTextareaValue(v) {
	if (v == null) return "";
	const s = escapeHtml(typeof v === "string" ? v : String(v));
	return s.charCodeAt(0) === 10 ? "\n" + s : s;
}
var SELECT_STACK = [];
/**
* Serialize a controlled `<select>`'s children under a projection scope:
* every `<option>` rendered inside (compiled or de-opt, any nesting) consults
* the innermost scope via ssrOption and marks itself ` selected` on match —
* the server analogue of the client's projectSelectValue. `value` wins over
* `defaultValue` (the client cascade). A no-match single select needs no
* server work: the parser selects the first option natively, matching the
* client's first-non-disabled fallback for the overwhelmingly common case.
*/
function ssrSelectScope(value, defaultValue, multiple, children) {
	const v = value != null ? value : defaultValue;
	let frame;
	if (v == null) frame = {
		single: null,
		multi: null
	};
	else if (multiple) frame = Array.isArray(v) ? {
		single: null,
		multi: new Set(v.map((x) => String(x)))
	} : {
		single: null,
		multi: null
	};
	else frame = Array.isArray(v) ? {
		single: null,
		multi: null
	} : {
		single: String(v),
		multi: null
	};
	SELECT_STACK.push(frame);
	try {
		return children();
	} finally {
		SELECT_STACK.pop();
	}
}
function unescapeOptionText(s) {
	if (s.indexOf("&") === -1) return s;
	return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
/**
* Assemble one `<option>`: `attrs` are its serialized attributes (its value
* attribute included when present), `content` its serialized children,
* `value` the RAW value prop (undefined = none → the option's flattened text
* is the compare key, per React). Returns a plain option when no controlled
* select scope is active.
*/
function ssrOption(value, attrs, content) {
	return "<option" + attrs + ssrOptionSelected(value, content) + ">" + content + "</option>";
}
function ssrOptionSelected(value, content) {
	if (SELECT_STACK.length === 0) return "";
	const scope = SELECT_STACK[SELECT_STACK.length - 1];
	if (scope.single === null && scope.multi === null) return "";
	let key;
	if (value != null) key = String(value);
	else {
		if (content.indexOf("<") !== -1) return "";
		key = unescapeOptionText(content);
	}
	if (scope.multi !== null) return scope.multi.has(key) ? " selected" : "";
	return scope.single === key ? " selected" : "";
}
var nextHookSlot = 0;
function hookSlots(count) {
	const base = nextHookSlot;
	nextHookSlot += count;
	return base;
}
var HOOK_PASS = null;
var HOOK_SLOT_PATH = [];
var NO_SLOT = "@state";
function appendHookSlotPath(key, slot) {
	let type;
	let value;
	if (typeof slot === "number") {
		type = "n";
		value = String(slot);
	} else if (typeof slot === "symbol") {
		type = "s";
		value = slot.description ?? "";
	} else {
		type = "t";
		value = slot;
	}
	return key + type + value.length + ":" + value;
}
function resolveHookSlot(slot) {
	const own = typeof slot === "symbol" || typeof slot === "string" || typeof slot === "number" ? slot : void 0;
	const depth = HOOK_SLOT_PATH.length;
	if (depth === 0) return own ?? NO_SLOT;
	if (own === void 0 && depth === 1) return HOOK_SLOT_PATH[0];
	let key = "@octane:hook:";
	for (let i = 0; i < depth; i++) key = appendHookSlotPath(key, HOOK_SLOT_PATH[i]);
	if (own !== void 0) key = appendHookSlotPath(key, own);
	return Symbol.for(key);
}
var MAX_RENDER_PHASE_PASSES = 25;
function basicStateReducer(s, a) {
	return typeof a === "function" ? a(s) : a;
}
function hookPosition(slot) {
	const hp = HOOK_PASS;
	if (hp === null) return null;
	const key = resolveHookSlot(slot);
	const index = hp.occ.get(key) ?? 0;
	hp.occ.set(key, index + 1);
	let list = hp.hooks.get(key);
	if (list === void 0) hp.hooks.set(key, list = []);
	return {
		hp,
		list,
		index
	};
}
function stateHook(reducer, create, slot, withGetter = false) {
	const hp = HOOK_PASS;
	if (hp === null) {
		const value = create();
		return withGetter ? [
			value,
			NOOP,
			() => value
		] : [value, NOOP];
	}
	const { list, index: n } = hookPosition(slot);
	let rec = list[n];
	if (rec === void 0) {
		const value = create();
		if (withGetter) {
			const r = {
				value,
				pendingValue: value,
				queue: [],
				reducer,
				dispatch: (action) => {
					if (hp !== HOOK_PASS) return;
					r.queue.push(action);
					r.pendingValue = r.reducer(r.pendingValue, action);
					hp.update = true;
				}
			};
			list[n] = rec = r;
		} else {
			const r = {
				value,
				queue: [],
				dispatch: (action) => {
					if (hp !== HOOK_PASS) return;
					r.queue.push(action);
					hp.update = true;
				}
			};
			list[n] = rec = r;
		}
	} else if (rec.queue.length > 0) if (withGetter) {
		const getterRec = rec;
		if (getterRec.reducer === reducer) rec.value = getterRec.pendingValue;
		else {
			let value = rec.value;
			const queue = rec.queue;
			for (let i = 0; i < queue.length; i++) value = reducer(value, queue[i]);
			rec.value = value;
			getterRec.pendingValue = value;
		}
		rec.queue = [];
	} else {
		let value = rec.value;
		const queue = rec.queue;
		for (let i = 0; i < queue.length; i++) value = reducer(value, queue[i]);
		rec.queue = [];
		rec.value = value;
	}
	if (!withGetter) return [rec.value, rec.dispatch];
	const getterRec = rec;
	getterRec.reducer = reducer;
	const getter = getterRec.getter ??= () => getterRec.pendingValue;
	return [
		rec.value,
		rec.dispatch,
		getter
	];
}
function captureComponentReplayState(scope, frame) {
	const css = CSS;
	const head = HEAD;
	const serial = SERIAL;
	const susp = SUSPENDED;
	const jobs = DEFERRED;
	const stream = STREAM;
	return {
		id: ID_COUNTER,
		css,
		cssEntries: css === null ? null : new Map(css),
		head,
		headLength: head !== null ? head.html.length : 0,
		headHints: head === null ? null : new Set(head.hints),
		serial,
		serialLength: serial !== null ? serial.length : 0,
		susp,
		suspLength: susp !== null ? susp.length : 0,
		jobs,
		jobsLength: jobs !== null ? jobs.length : 0,
		context: scope.$$ctxValues,
		vtTrySeq: VT_SSR_TRY_SEQ,
		vtHasCandidates: VT_SSR_HAS_CANDIDATES,
		vtStack: VT_SSR_STACK.map((candidate) => ({
			candidate,
			consumed: candidate.consumed
		})),
		stream,
		streamNextId: stream?.nextId ?? 0,
		streamActiveTryKeys: stream?.activeTryKeys.slice() ?? [],
		streamActiveOwnerKeys: stream?.activeOwnerKeys.slice() ?? [],
		streamPassBoundaryKeys: stream?.activePassBoundaryKeys === null || stream?.activePassBoundaryKeys === void 0 ? null : new Set(stream.activePassBoundaryKeys),
		asyncScope: ASYNC_SCOPE,
		streamBoundaries: stream === null ? null : Array.from(stream.boundaries, ([key, entry]) => ({
			key,
			entry,
			id: entry.id,
			order: entry.order,
			state: entry.state,
			html: entry.html,
			seeds: entry.seeds.slice(),
			pendingIdOffset: entry.pendingIdOffset,
			ancestors: entry.ancestors.slice(),
			owners: entry.owners.slice(),
			namespace: entry.namespace
		})),
		frameDeferred: frame?.deferred ?? false,
		frameNextChild: frame?.nextChild ?? 0,
		frameScopedChildren: frame?.scopedChildren === null || frame?.scopedChildren === void 0 ? null : new Map(frame.scopedChildren),
		frameOccurrences: frame?.occ === null || frame?.occ === void 0 ? null : new Map(frame.occ)
	};
}
function rewindComponentReplayState(snapshot, scope, frame) {
	ID_COUNTER = snapshot.id;
	ASYNC_SCOPE = snapshot.asyncScope;
	if (snapshot.css !== null && snapshot.cssEntries !== null) {
		snapshot.css.clear();
		for (const [hash, sheet] of snapshot.cssEntries) snapshot.css.set(hash, sheet);
	}
	if (snapshot.head !== null && snapshot.headHints !== null) {
		snapshot.head.html = snapshot.head.html.slice(0, snapshot.headLength);
		snapshot.head.hints.clear();
		for (const key of snapshot.headHints) snapshot.head.hints.add(key);
	}
	if (snapshot.serial !== null) snapshot.serial.length = snapshot.serialLength;
	if (snapshot.susp !== null) snapshot.susp.length = snapshot.suspLength;
	if (snapshot.jobs !== null) snapshot.jobs.length = snapshot.jobsLength;
	VT_SSR_TRY_SEQ = snapshot.vtTrySeq;
	VT_SSR_HAS_CANDIDATES = snapshot.vtHasCandidates;
	VT_SSR_STACK.length = 0;
	for (const entry of snapshot.vtStack) {
		entry.candidate.consumed = entry.consumed;
		VT_SSR_STACK.push(entry.candidate);
	}
	const stream = snapshot.stream;
	if (stream !== null && snapshot.streamBoundaries !== null) {
		stream.nextId = snapshot.streamNextId;
		if (stream.activePassBoundaryKeys !== null && snapshot.streamPassBoundaryKeys !== null) {
			stream.activePassBoundaryKeys.clear();
			for (const key of snapshot.streamPassBoundaryKeys) stream.activePassBoundaryKeys.add(key);
		}
		stream.activeTryKeys.length = 0;
		stream.activeTryKeys.push(...snapshot.streamActiveTryKeys);
		stream.activeOwnerKeys.length = 0;
		stream.activeOwnerKeys.push(...snapshot.streamActiveOwnerKeys);
		stream.boundaries.clear();
		for (const saved of snapshot.streamBoundaries) {
			const entry = saved.entry;
			entry.id = saved.id;
			entry.order = saved.order;
			entry.state = saved.state;
			entry.html = saved.html;
			entry.seeds = saved.seeds.slice();
			entry.pendingIdOffset = saved.pendingIdOffset;
			entry.ancestors = saved.ancestors.slice();
			entry.owners = saved.owners.slice();
			entry.namespace = saved.namespace;
			stream.boundaries.set(saved.key, entry);
		}
	}
	scope.$$ctxValues = snapshot.context;
	if (frame !== null) {
		frame.deferred = snapshot.frameDeferred;
		frame.nextChild = snapshot.frameNextChild;
		frame.scopedChildren = snapshot.frameScopedChildren === null ? null : new Map(snapshot.frameScopedChildren);
		frame.occ = snapshot.frameOccurrences === null ? null : new Map(snapshot.frameOccurrences);
	}
}
function invokeComponentBody(comp, props, scope, frame) {
	const prevHP = HOOK_PASS;
	const hp = {
		hooks: /* @__PURE__ */ new Map(),
		occ: /* @__PURE__ */ new Map(),
		update: false
	};
	const snapshot = captureComponentReplayState(scope, frame);
	const warmPlanCheckpoint = ACTIVE_PU_WARM_PLANS.length;
	HOOK_PASS = hp;
	try {
		ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
		let out = comp(props ?? {}, scope, void 0);
		let passes = 1;
		while (hp.update) {
			if (++passes > MAX_RENDER_PHASE_PASSES) throw new Error("Too many re-renders. Octane limits the number of renders to prevent an infinite loop.");
			hp.update = false;
			hp.occ = /* @__PURE__ */ new Map();
			rewindComponentReplayState(snapshot, scope, frame);
			ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
			out = comp(props ?? {}, scope, void 0);
		}
		return out;
	} finally {
		ACTIVE_PU_WARM_PLANS.length = warmPlanCheckpoint;
		HOOK_PASS = prevHP;
	}
}
function renderComponentFramed(comp, props, parent, frame, inherit) {
	const prevScope = CURRENT_SCOPE;
	const prevFrame = FRAME;
	const prevComp = CURRENT_COMP;
	const prevProps = CURRENT_PROPS;
	const prevParent = CURRENT_PARENT_SCOPE;
	const prevAsyncScope = ASYNC_SCOPE;
	const parentScope = parent ?? prevScope;
	const scope = ssrScope(parentScope);
	CURRENT_SCOPE = scope;
	FRAME = frame;
	CURRENT_COMP = comp;
	CURRENT_PROPS = props;
	CURRENT_PARENT_SCOPE = parentScope;
	ASYNC_SCOPE = frame.asyncScope;
	try {
		const out = invokeComponentBody(comp, props, scope, frame);
		const inner = typeof out === "string" ? out : out == null ? "" : ssrChild(out, scope);
		return MARKERS && !inherit ? BLOCK_OPEN + inner + BLOCK_CLOSE : inner;
	} finally {
		CURRENT_SCOPE = prevScope;
		FRAME = prevFrame;
		CURRENT_COMP = prevComp;
		CURRENT_PROPS = prevProps;
		CURRENT_PARENT_SCOPE = prevParent;
		ASYNC_SCOPE = prevAsyncScope;
	}
}
/**
* Render a child component into the string: fresh scope + frame, body → HTML.
* `inherit` (M3): the compiled call site is the sole root of its parent's
* `@{}` body — emit WITHOUT the surrounding `<!--[-->…<!--]-->` pair (the
* parent's own range bounds it; the client borrows that range). Applies to
* both the component branch (frame wrap) and the string-tag branch (ssrBlock).
*/
function ssrComponent(parent, comp, props, inherit, key, identityScoped) {
	const previousIdentityScope = ASYNC_SCOPE;
	if (identityScoped !== true) {
		ASYNC_SCOPE = previousIdentityScope + "|@component-type:" + asyncIdentityKey(comp, false);
		if (key != null) ASYNC_SCOPE += "|@component-key:" + asyncIdentityKey(key, true);
	}
	try {
		const explicitNamespace = NEXT_COMPONENT_NAMESPACE;
		NEXT_COMPONENT_NAMESPACE = null;
		if (inherit === true && hasComponentFlags(comp, 1)) inherit = false;
		if (typeof comp === "string") {
			const inheritedNamespace = explicitNamespace ?? FRAME?.namespace ?? "html";
			const childNamespace = parserNamespacesForTag(comp.toLowerCase(), inheritedNamespace).childrenNamespace;
			return ssrInNamespace(childNamespace, () => {
				const kids = props?.children;
				if (typeof kids === "function") {
					const out = kids(void 0, parent);
					const html = ssrHostElement(comp, props, null, parent, typeof out === "string" ? out : out == null ? "" : ssrChild(out, parent));
					return inherit ? html : ssrBlock(html);
				}
				const html = ssrHostElement(comp, props, kids, parent);
				return inherit ? html : ssrBlock(html);
			});
		}
		const pf = FRAME;
		const frame = pf === null ? {
			parent: null,
			seg: 0,
			nextChild: 0,
			scopedChildren: null,
			occ: null,
			path: null,
			deferred: false,
			asyncScope: ASYNC_SCOPE
		} : {
			parent: pf,
			seg: nextChildSegment(pf),
			nextChild: 0,
			scopedChildren: null,
			occ: null,
			path: null,
			deferred: false,
			asyncScope: ASYNC_SCOPE
		};
		frame.namespace = explicitNamespace ?? pf?.namespace;
		return renderComponentFramed(comp, props, parent, frame, inherit);
	} finally {
		if (identityScoped !== true) ASYNC_SCOPE = previousIdentityScope;
	}
}
var NEXT_COMPONENT_NAMESPACE = null;
/** Run a renderable hole under a lexically proven parser namespace. */
function ssrInNamespace(namespace, render) {
	const frame = FRAME;
	if (frame === null) return render();
	const previous = frame.namespace;
	frame.namespace = namespace;
	try {
		return render();
	} finally {
		frame.namespace = previous;
	}
}
function ssrChildrenHtml(children, scope) {
	if (typeof children === "function") return children(void 0, scope) ?? "";
	return ssrChild(children, scope);
}
/**
* `<Suspense fallback={…}>…</Suspense>` — the JSX built-in mirror of the
* `@try { … } @pending { fallback }` directive, for authors writing JSX (e.g.
* porting React). Emits the SAME nested-block shape the compiler's `ssrEmitTry`
* produces for the directive: an outer try-slot `ssrBlock` around the active
* branch's inner `ssrBlock`, so the client's `<Suspense>` (componentSlot →
* tryBlock) adopts it byte-for-byte. A descendant `use(thenable)` that hasn't
* resolved throws `SSR_SUSPENSE` → the `fallback` renders for this pass and
* render()'s loop awaits + re-renders; a real error rethrows to an outer boundary.
*/
var Suspense = /* @__PURE__ */ markComponentFlags(function Suspense(props, scope) {
	return ssrTry(scope, "jsx-suspense", (_arg, s) => ssrChildrenHtml(props.children, s), (_arg, s) => ssrChild(props.fallback, s), null, FRAME?.namespace ?? "html");
}, 1, "Suspense");
var VT_SSR_TRY_SEQ = 0;
var VT_SSR_HAS_CANDIDATES = false;
var VT_SSR_STACK = [];
/**
* Inject `vt-*` attributes into the FIRST element open-tag of an HTML
* fragment, skipping block/comment markers and streaming `<template>`
* placeholders (the annotation belongs on the visible fallback root that
* follows). Attributes already present (an inner boundary annotated first —
* innermost owns vt-update) are left alone.
*/
function vtSsrAnnotate(html, attrs) {
	const n = html.length;
	let i = 0;
	while (i < n) {
		const lt = html.indexOf("<", i);
		if (lt === -1) return html;
		if (html.startsWith("<!--", lt)) {
			const close = html.indexOf("-->", lt + 4);
			if (close === -1) return html;
			i = close + 3;
			continue;
		}
		const c = html.charCodeAt(lt + 1);
		if (!(c >= 65 && c <= 90 || c >= 97 && c <= 122)) {
			i = lt + 1;
			continue;
		}
		let e = lt + 1;
		while (e < n && /[a-zA-Z0-9-]/.test(html[e])) e++;
		const tag = html.slice(lt + 1, e).toLowerCase();
		let j = e;
		let q = "";
		while (j < n) {
			const ch = html[j];
			if (q !== "") {
				if (ch === q) q = "";
			} else if (ch === "\"" || ch === "'") q = ch;
			else if (ch === ">") break;
			j++;
		}
		if (j >= n) return html;
		if (tag === "template") {
			const close = html.indexOf("</template>", j);
			i = close === -1 ? j + 1 : close + 11;
			continue;
		}
		const open = html.slice(lt, j);
		let inject = "";
		for (let k = 0; k < attrs.length; k++) if (open.indexOf(attrs[k][0] + "=\"") === -1) inject += " " + attrs[k][0] + "=\"" + escapeAttr(attrs[k][1]) + "\"";
		if (inject === "") return html;
		const at = html[j - 1] === "/" ? j - 1 : j;
		return html.slice(0, at) + inject + html.slice(at);
	}
	return html;
}
/**
* Claim an arm-top candidate: rename `vt-enter-x`/`vt-exit-x` → `vt-enter`/
* `vt-exit` on the FIRST element of an arm's HTML (same template/comment
* skipping as vtSsrAnnotate). A first element without the candidate (e.g. a
* static wrapper above the boundary, or an outer boundary's annotation target)
* claims nothing — that is exactly React's "top of the arm only" rule.
*/
function vtSsrClaimArm(html, kind) {
	const n = html.length;
	let i = 0;
	while (i < n) {
		const lt = html.indexOf("<", i);
		if (lt === -1) return html;
		if (html.startsWith("<!--", lt)) {
			const close = html.indexOf("-->", lt + 4);
			if (close === -1) return html;
			i = close + 3;
			continue;
		}
		const c = html.charCodeAt(lt + 1);
		if (!(c >= 65 && c <= 90 || c >= 97 && c <= 122)) {
			i = lt + 1;
			continue;
		}
		let e = lt + 1;
		while (e < n && /[a-zA-Z0-9-]/.test(html[e])) e++;
		const tag = html.slice(lt + 1, e).toLowerCase();
		let j = e;
		let q = "";
		while (j < n) {
			const ch = html[j];
			if (q !== "") {
				if (ch === q) q = "";
			} else if (ch === "\"" || ch === "'") q = ch;
			else if (ch === ">") break;
			j++;
		}
		if (j >= n) return html;
		if (tag === "template") {
			const close = html.indexOf("</template>", j);
			i = close === -1 ? j + 1 : close + 11;
			continue;
		}
		const marker = " vt-" + kind + "-x=\"";
		const at = html.slice(lt, j).indexOf(marker);
		if (at === -1) return html;
		return html.slice(0, lt + at) + " vt-" + kind + "=\"" + html.slice(lt + at + marker.length);
	}
	return html;
}
/** Strip residual (unclaimed) arm candidates before emission. */
function vtSsrStrip(html) {
	if (html.indexOf(" vt-e") === -1) return html;
	return html.replace(/ vt-(?:enter|exit)-x="[^"]*"/g, "");
}
var CONTEXT_TAG = Symbol.for("octane.context");
function createContext(defaultValue) {
	const ctx = function ProviderBody(props, scope) {
		if (scope.$$ctxValues === null) scope.$$ctxValues = /* @__PURE__ */ new Map();
		scope.$$ctxValues.set(ctx, props.value);
		const children = props.children;
		if (children == null) return "";
		return typeof children === "function" ? children(void 0, scope) ?? "" : ssrChild(children, scope);
	};
	ctx.$$kind = CONTEXT_TAG;
	ctx.defaultValue = defaultValue;
	ctx.Provider = ctx;
	return ctx;
}
function readContext(ctx) {
	for (let s = CURRENT_SCOPE; s !== null; s = s.parent) if (s.$$ctxValues !== null && s.$$ctxValues.has(ctx)) return s.$$ctxValues.get(ctx);
	return ctx.defaultValue;
}
function useContext(ctx) {
	if (ctx && ctx.$$kind === CONTEXT_TAG) return readContext(ctx);
	return readHostedForeignContext(ctx, "useContext");
}
var SSR_SUSPENSE = Symbol("octane.ssr.suspense");
function ssrIsSuspense(err) {
	return err === SSR_SUSPENSE;
}
var HYDRATION_REJECTION_SEED = Symbol("octane.ssr.hydration-rejection-seed");
function reasonSnapshot(value, state = {
	active: /* @__PURE__ */ new WeakSet(),
	nodes: 0
}, depth = 0) {
	if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "undefined") return value;
	if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0) ? value : String(value);
	if (typeof value === "bigint") return String(value);
	if (typeof value === "symbol") return "[symbol]";
	if (typeof value === "function") return "[function]";
	if (depth >= 20 || state.nodes++ >= 512) return "[truncated]";
	if (state.active.has(value)) return "[Circular]";
	state.active.add(value);
	try {
		let isArray;
		try {
			isArray = Array.isArray(value);
		} catch {
			return "[unavailable]";
		}
		if (isArray) {
			const arrayValue = value;
			let length = 0;
			try {
				length = Math.min(arrayValue.length, 512);
			} catch {
				return "[unavailable]";
			}
			const out = new Array(length);
			for (let i = 0; i < length; i++) try {
				if (Object.prototype.hasOwnProperty.call(arrayValue, i)) out[i] = reasonSnapshot(arrayValue[i], state, depth + 1);
			} catch {
				out[i] = "[unavailable]";
			}
			return out;
		}
		const out = Object.create(null);
		let keys;
		try {
			keys = Object.keys(value);
		} catch {
			return "[unavailable]";
		}
		const length = Math.min(keys.length, 512);
		for (let i = 0; i < length; i++) {
			const key = keys[i];
			try {
				out[key] = reasonSnapshot(value[key], state, depth + 1);
			} catch {
				out[key] = "[unavailable]";
			}
		}
		if (keys.length > length) out.__octane_truncated__ = true;
		return out;
	} finally {
		state.active.delete(value);
	}
}
function isErrorReason(reason) {
	try {
		if (reason instanceof Error) return true;
		if (reason === null || typeof reason !== "object") return false;
		const tag = Object.prototype.toString.call(reason);
		return tag === "[object Error]" || tag === "[object DOMException]";
	} catch {
		return false;
	}
}
function hydrationRejectionPayload(reason) {
	try {
		return hydrationRejectionPayloadUnsafe(reason);
	} catch {
		return {
			kind: "fallback",
			message: "Server-rendered use() rejected"
		};
	}
}
function hydrationRejectionPayloadUnsafe(reason) {
	if (typeof reason === "number" && (!Number.isFinite(reason) || Object.is(reason, -0))) return {
		kind: "number",
		value: Number.isNaN(reason) ? "NaN" : Object.is(reason, -0) ? "-0" : reason === Infinity ? "Infinity" : "-Infinity"
	};
	if (typeof reason === "bigint") return {
		kind: "bigint",
		value: String(reason)
	};
	if (typeof reason === "symbol") return {
		kind: "symbol",
		value: reason.description ?? ""
	};
	if (isErrorReason(reason)) {
		let name = "Error";
		let message = "Server-rendered use() rejected";
		try {
			const candidate = reason.name;
			if (typeof candidate === "string") name = candidate;
		} catch {}
		try {
			const candidate = reason.message;
			if (typeof candidate === "string") message = candidate;
		} catch {}
		const fields = Object.create(null);
		let keys = [];
		try {
			keys = Object.keys(reason);
		} catch {}
		const length = Math.min(keys.length, 512);
		const snapshotState = {
			active: /* @__PURE__ */ new WeakSet(),
			nodes: 0
		};
		snapshotState.active.add(reason);
		for (let i = 0; i < length; i++) {
			const key = keys[i];
			if (key === "name" || key === "message" || key === "stack") continue;
			try {
				fields[key] = reasonSnapshot(reason[key], snapshotState);
			} catch {
				fields[key] = "[unavailable]";
			}
		}
		if (keys.length > length) fields.__octane_truncated__ = true;
		return {
			kind: "error",
			name,
			message,
			fields
		};
	}
	if (typeof reason === "function") return {
		kind: "fallback",
		message: "Server-rendered use() rejected (function)"
	};
	return {
		kind: "value",
		value: reasonSnapshot(reason)
	};
}
function hydrationRejectionSeed(reason) {
	return { [HYDRATION_REJECTION_SEED]: hydrationRejectionPayload(reason) };
}
function isHydrationRejectionSeed(value) {
	return value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, HYDRATION_REJECTION_SEED);
}
function recordHydrationRejection(serial, reason) {
	if (serial !== null) serial.push(hydrationRejectionSeed(reason));
}
function hasExternalHydrationOwner(thenable) {
	try {
		return thenable[EXTERNAL_HYDRATION_PROMISE] === true;
	} catch {
		return false;
	}
}
function use(usable, siteKey) {
	if (usable && usable.$$kind === CONTEXT_TAG) return readContext(usable);
	const serial = hasExternalHydrationOwner(usable) ? null : SERIAL;
	if (usable == null || typeof usable.then !== "function") return readHostedForeignContext(usable, "use");
	const base = siteKey === void 0 ? "@" : typeof siteKey === "symbol" ? siteKey.toString() : String(siteKey);
	const frame = FRAME;
	let n = 0;
	let prefix = ASYNC_SCOPE;
	if (frame !== null) {
		n = nextFrameOccurrence(frame, base);
		prefix = asyncFramePath(frame);
	}
	const key = prefix + "|" + base + "#" + n;
	if (RESOLVED !== null) {
		const entryT = RESOLVED.pu.resolvedT.get(usable);
		if (entryT !== void 0) {
			if ("reason" in entryT) {
				recordHydrationRejection(serial, entryT.reason);
				throw entryT.reason;
			}
			if (serial !== null) serial.push(entryT.value);
			return entryT.value;
		}
	}
	const resolved = RESOLVED;
	if (resolved !== null && resolved.has(key)) {
		const entry = resolved.get(key);
		if ("reason" in entry) {
			recordHydrationRejection(serial, entry.reason);
			throw entry.reason;
		}
		if (serial !== null) serial.push(entry.value);
		return entry.value;
	}
	const instrumented = usable;
	let status = instrumented.status;
	const wasUninstrumented = status === void 0;
	if (status === "fulfilled") {
		if (serial !== null) serial.push(instrumented.value);
		return instrumented.value;
	}
	if (status === "rejected") {
		recordHydrationRejection(serial, instrumented.reason);
		throw instrumented.reason;
	}
	if (wasUninstrumented) {
		instrumented.status = "pending";
		instrumented.then((value) => {
			if (instrumented.status === "pending") {
				instrumented.status = "fulfilled";
				instrumented.value = value;
			}
		}, (reason) => {
			if (instrumented.status === "pending") {
				instrumented.status = "rejected";
				instrumented.reason = reason;
			}
		});
		status = instrumented.status;
		if (status === "fulfilled") {
			if (serial !== null) serial.push(instrumented.value);
			return instrumented.value;
		}
		if (status === "rejected") {
			recordHydrationRejection(serial, instrumented.reason);
			throw instrumented.reason;
		}
	}
	if (!wasUninstrumented && typeof status === "string") {
		instrumented.then(NOOP, NOOP);
		status = instrumented.status;
		if (status === "fulfilled") {
			if (serial !== null) serial.push(instrumented.value);
			return instrumented.value;
		}
		if (status === "rejected") {
			recordHydrationRejection(serial, instrumented.reason);
			throw instrumented.reason;
		}
	}
	if (SUSPENDED !== null) SUSPENDED.push({
		promise: usable,
		key
	});
	if (DEFERRED !== null && CURRENT_COMP !== null && frame !== null && !frame.deferred) {
		frame.deferred = true;
		DEFERRED.push({
			comp: CURRENT_COMP,
			props: CURRENT_PROPS,
			parentScope: CURRENT_PARENT_SCOPE,
			frame
		});
	}
	throw SSR_SUSPENSE;
}
var PU_ID = 0;
/**
* Register every unresolved thenable of a hoisted-creation run with the render
* loop, then suspend ONCE — the loop awaits them together and records their
* outcomes by identity (resolvedT), so the next pass's use() unwraps all
* succeed in one go. Already-registered-but-unsettled thenables (streaming
* re-passes render between waves) still force the suspend but are not pushed
* again. Falls through silently when everything is already resolved.
*/
function puBatch(thenables, warm) {
	if (thenables.length === 0) {
		if (warm !== void 0) ACTIVE_PU_WARM_PLANS.push(warm);
		return;
	}
	const res = RESOLVED;
	const pu = res !== null ? res.pu : null;
	let pending = false;
	for (let i = 0; i < thenables.length; i++) {
		const t = thenables[i];
		if (t == null || typeof t.then !== "function") continue;
		if (pu !== null && pu.resolvedT.has(t)) continue;
		const instrumented = t;
		let status = instrumented.status;
		const wasUninstrumented = status === void 0;
		if (wasUninstrumented) {
			instrumented.status = "pending";
			instrumented.then((value) => {
				if (instrumented.status === "pending") {
					instrumented.status = "fulfilled";
					instrumented.value = value;
				}
			}, (reason) => {
				if (instrumented.status === "pending") {
					instrumented.status = "rejected";
					instrumented.reason = reason;
				}
			});
			status = instrumented.status;
		}
		if (!wasUninstrumented && typeof status === "string" && status !== "fulfilled" && status !== "rejected") {
			instrumented.then(NOOP, NOOP);
			status = instrumented.status;
		}
		if (status === "fulfilled") {
			pu?.resolvedT.set(t, { value: instrumented.value });
			continue;
		}
		if (status === "rejected") {
			pu?.resolvedT.set(t, { reason: instrumented.reason });
			continue;
		}
		pending = true;
		if (SUSPENDED !== null) SUSPENDED.push({
			promise: t,
			key: "|pu#" + PU_ID++
		});
	}
	if (!pending) return;
	if (ACTIVE_PU_WARM_PLANS.length !== 0 || warm !== void 0) {
		const previousClaims = CURRENT_PU_WARM_CLAIMS;
		CURRENT_PU_WARM_CLAIMS = /* @__PURE__ */ new Set();
		try {
			for (let i = 0; i < ACTIVE_PU_WARM_PLANS.length; i++) {
				CURRENT_PU_WARM_CLAIMS = /* @__PURE__ */ new Set();
				try {
					ACTIVE_PU_WARM_PLANS[i]();
				} catch {}
			}
			if (warm !== void 0) {
				CURRENT_PU_WARM_CLAIMS = /* @__PURE__ */ new Set();
				try {
					warm();
				} catch {}
			}
		} finally {
			CURRENT_PU_WARM_CLAIMS = previousClaims;
		}
	}
	const frame = FRAME;
	if (DEFERRED !== null && CURRENT_COMP !== null && frame !== null && !frame.deferred) {
		frame.deferred = true;
		DEFERRED.push({
			comp: CURRENT_COMP,
			props: CURRENT_PROPS,
			parentScope: CURRENT_PARENT_SCOPE,
			frame
		});
	}
	throw SSR_SUSPENSE;
}
var WARM_DEPTH = 0;
var WARM_DEPTH_CAP = 64;
/**
* Recurse the warm walk into a child component's compiled fetch plan
* (`Comp.__warm`, attached by compileServerComponent when the child's
* reachability and props are provably independent of suspended values).
* No-ops for components without a plan.
*/
function warmChild(comp, props) {
	if (comp == null) return;
	const plan = comp.__warm;
	if (typeof plan !== "function") return;
	if (WARM_DEPTH >= WARM_DEPTH_CAP) return;
	WARM_DEPTH++;
	try {
		plan(props);
	} catch {} finally {
		WARM_DEPTH--;
	}
}
function useState(initial, slot) {
	if (slot === void 0 && typeof initial === "symbol") {
		slot = initial;
		initial = void 0;
	}
	return stateHook(basicStateReducer, () => typeof initial === "function" ? initial() : initial, slot);
}
function useEffect() {}
var useLayoutEffect = useEffect;
function serverHookDepsEqual(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
	return true;
}
function useMemo(compute, depsOrSlot, maybeSlot) {
	const deps = Array.isArray(depsOrSlot) ? depsOrSlot : null;
	const slot = maybeSlot ?? (Array.isArray(depsOrSlot) || depsOrSlot === null ? void 0 : depsOrSlot);
	if (deps === null) return compute();
	const position = hookPosition(slot);
	if (position === null) return compute();
	let rec = position.list[position.index];
	if (rec === void 0) {
		rec = {
			value: compute(),
			deps: deps.slice()
		};
		position.list[position.index] = rec;
	} else if (!serverHookDepsEqual(rec.deps, deps)) {
		rec.value = compute();
		rec.deps = deps.slice();
	}
	return rec.value;
}
function useCallback(fn, depsOrSlot, maybeSlot) {
	return useMemo(() => fn, depsOrSlot, maybeSlot);
}
function useRef(initial, slot) {
	if (slot === void 0 && typeof initial === "symbol") {
		slot = initial;
		initial = void 0;
	}
	const position = hookPosition(slot);
	if (position === null) return { current: initial };
	let rec = position.list[position.index];
	if (rec === void 0) {
		rec = { ref: { current: initial } };
		position.list[position.index] = rec;
	}
	return rec.ref;
}
function useSyncExternalStore(_subscribe, getSnapshot, ...rest) {
	const getServerSnapshot = rest.length >= 2 ? rest[0] : void 0;
	return getServerSnapshot ? getServerSnapshot() : getSnapshot();
}
function withSlot(sym, fn, ...args) {
	HOOK_SLOT_PATH.push(sym);
	try {
		return fn(...args);
	} finally {
		HOOK_SLOT_PATH.pop();
	}
}
function startTransition(fn) {
	fn();
}
function flushSync(fn) {
	return fn();
}
var CHILDREN_BLOCK = Symbol.for("octane.childrenBlock");
/**
* Compiler-emitted: tag a children-block render function so `isChildrenBlock`
* recognises it. Returns the function for inline use.
* @internal
*/
function markChildrenBlock(fn) {
	if (typeof fn === "function") fn[CHILDREN_BLOCK] = true;
	return fn;
}
/**
* True when `value` is a compiler-generated children-block (element/text
* children lowered to a render function) — as opposed to a user render-prop
* function or any other value. Server twin of the client helper.
*/
function isChildrenBlock(value) {
	return typeof value === "function" && value[CHILDREN_BLOCK] === true;
}
var HEAD_VOID_ELEMENTS = new Set([
	"meta",
	"link",
	"base"
]);
function ssrHeadEl(key, tag, attrs, text) {
	if (HEAD === null) return;
	let s = (MARKERS ? "<!--" + key + "-->" : "") + "<" + tag;
	if (attrs !== null) for (const k in attrs) {
		const v = attrs[k];
		if (v == null || v === false) continue;
		if (typeof v === "function" || k.length > 2 && k[0] === "o" && k[1] === "n") continue;
		if (v === "" && (k === "src" || k === "href")) continue;
		if (v === true) s += " " + k;
		else {
			const value = typeof v === "string" ? v : String(v);
			s += " " + k + "=\"" + escapeAttr(sanitizeURLAttribute(tag, k, value)) + "\"";
		}
	}
	if (HEAD_VOID_ELEMENTS.has(tag)) s += ">";
	else s += ">" + (text == null ? "" : escapeHtml(text)) + "</" + tag + ">";
	HEAD.html += s;
}
function spliceHead(body, head) {
	if (head === "") return body;
	const headClose = body.indexOf("</head>");
	if (headClose !== -1) return body.slice(0, headClose) + head + body.slice(headClose);
	return head + body;
}
/** Guard against a `use(thenable)` that never resolves wedging the render loop. */
var MAX_SUSPENSE_PASSES = 50;
var SUSPENSE_TIMEOUT_MS = 1e4;
function serializeSuspenseSeedJson(values) {
	let wireValues = null;
	let rejections = null;
	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		if (!isHydrationRejectionSeed(value)) continue;
		wireValues ??= values.slice();
		rejections ??= [];
		wireValues[i] = null;
		rejections.push([i, value[HYDRATION_REJECTION_SEED]]);
	}
	const payload = rejections === null ? values : { [REJECTION_SENTINEL_KEY]: {
		version: 1,
		values: wireValues,
		rejections
	} };
	const undefinedWire = SUSPENSE_SEED_WIRE_PREFIX + "u";
	const escapedStringWire = SUSPENSE_SEED_WIRE_PREFIX + "s";
	return JSON.stringify(payload, (_key, value) => {
		if (value === void 0) return undefinedWire;
		if (typeof value === "string" && value.startsWith("\0octane:ssr-seed:")) return escapedStringWire + value;
		return value;
	}).replace(/</g, "\\u003c");
}
/**
* Serialize the resolved `use(thenable)` values (in render order) into an inline
* data `<script>` the client reads during hydration. `<` is escaped to
* `\u003c` so the JSON payload can't terminate the `<script>` element or open
* an HTML comment. Only emitted when at least one value was resolved.
*/
function serializeSuspenseSeeds(values, nonceAttr) {
	const json = serializeSuspenseSeedJson(values);
	return "<script type=\"application/json\" " + SUSPENSE_SCRIPT_ATTR + nonceAttr + ">" + json + "<\/script>";
}
function newResolvedMap() {
	const m = /* @__PURE__ */ new Map();
	m.asyncIdentities = /* @__PURE__ */ new Map();
	m.asyncPositionIdentities = /* @__PURE__ */ new Map();
	m.nextAsyncIdentity = 0;
	m.pu = {
		created: /* @__PURE__ */ new Map(),
		resolvedT: /* @__PURE__ */ new Map(),
		warm: /* @__PURE__ */ new Map()
	};
	return m;
}
function saveAmbient() {
	return {
		scope: CURRENT_SCOPE,
		warmPlans: ACTIVE_PU_WARM_PLANS.slice(),
		warmClaims: CURRENT_PU_WARM_CLAIMS,
		id: ID_COUNTER,
		idPrefix: ID_PREFIX,
		css: CSS,
		nonceAttr: NONCE_ATTR,
		markers: MARKERS,
		head: HEAD,
		susp: SUSPENDED,
		res: RESOLVED,
		serial: SERIAL,
		frame: FRAME,
		deferred: DEFERRED,
		comp: CURRENT_COMP,
		props: CURRENT_PROPS,
		parentScope: CURRENT_PARENT_SCOPE,
		asyncScope: ASYNC_SCOPE,
		ssrElement: CURRENT_SSR_ELEMENT,
		nestingWarnings: SSR_NESTING_WARNINGS,
		vtTrySeq: VT_SSR_TRY_SEQ,
		vtHasCandidates: VT_SSR_HAS_CANDIDATES,
		vtStack: VT_SSR_STACK.map((candidate) => ({
			candidate,
			consumed: candidate.consumed
		}))
	};
}
function restoreAmbient(a) {
	CURRENT_SCOPE = a.scope;
	ACTIVE_PU_WARM_PLANS.length = 0;
	ACTIVE_PU_WARM_PLANS.push(...a.warmPlans);
	CURRENT_PU_WARM_CLAIMS = a.warmClaims;
	ID_COUNTER = a.id;
	ID_PREFIX = a.idPrefix;
	CSS = a.css;
	NONCE_ATTR = a.nonceAttr;
	MARKERS = a.markers;
	HEAD = a.head;
	SUSPENDED = a.susp;
	RESOLVED = a.res;
	SERIAL = a.serial;
	FRAME = a.frame;
	DEFERRED = a.deferred;
	CURRENT_COMP = a.comp;
	CURRENT_PROPS = a.props;
	CURRENT_PARENT_SCOPE = a.parentScope;
	ASYNC_SCOPE = a.asyncScope;
	CURRENT_SSR_ELEMENT = a.ssrElement;
	SSR_NESTING_WARNINGS = a.nestingWarnings;
	VT_SSR_TRY_SEQ = a.vtTrySeq;
	VT_SSR_HAS_CANDIDATES = a.vtHasCandidates;
	VT_SSR_STACK.length = 0;
	for (const snapshot of a.vtStack) {
		snapshot.candidate.consumed = snapshot.consumed;
		VT_SSR_STACK.push(snapshot.candidate);
	}
}
function nonceAttrOf(options) {
	return options?.nonce ? " nonce=\"" + escapeAttr(options.nonce) + "\"" : "";
}
function runFullFramedPass(component, props, resolved, nonceAttr = "", identifierPrefix = "", markers = true) {
	const saved = saveAmbient();
	ACTIVE_PU_WARM_PLANS.length = 0;
	CURRENT_PU_WARM_CLAIMS = null;
	ID_COUNTER = 0;
	ID_PREFIX = identifierPrefix;
	NONCE_ATTR = nonceAttr;
	ASYNC_SCOPE = "";
	MARKERS = markers;
	VT_SSR_TRY_SEQ = 0;
	VT_SSR_HAS_CANDIDATES = false;
	VT_SSR_STACK.length = 0;
	const cssMap = CSS = /* @__PURE__ */ new Map();
	const headBuf = HEAD = {
		html: "",
		hints: /* @__PURE__ */ new Set()
	};
	const suspended = SUSPENDED = [];
	const serial = SERIAL = [];
	const deferred = DEFERRED = [];
	RESOLVED = resolved;
	CURRENT_SSR_ELEMENT = null;
	SSR_NESTING_WARNINGS = resolved.nestingWarnings;
	const root = ssrScope(null);
	CURRENT_SCOPE = root;
	FRAME = {
		parent: null,
		seg: 0,
		nextChild: 0,
		scopedChildren: null,
		occ: null,
		path: "",
		deferred: false,
		asyncScope: ""
	};
	CURRENT_COMP = component;
	CURRENT_PROPS = props;
	CURRENT_PARENT_SCOPE = null;
	let body = "";
	let vtCandidates = false;
	let rootSuspended = false;
	try {
		const out = invokeComponentBody(component, props, root, FRAME);
		body = typeof out === "string" ? out : out == null ? "" : ssrChild(out, root);
	} catch (err) {
		if (!ssrIsSuspense(err)) throw err;
		rootSuspended = true;
	} finally {
		vtCandidates = VT_SSR_HAS_CANDIDATES;
		restoreAmbient(saved);
	}
	let css = "";
	for (const [hash, sheet] of cssMap) css += "<style data-octane=\"" + hash + "\"" + nonceAttr + ">" + escapeEntireInlineStyleContent(sheet) + "</style>";
	return {
		body,
		head: headBuf.html,
		css,
		serial,
		suspended,
		deferred,
		rootSuspended,
		vtCandidates,
		cssEntries: cssMap
	};
}
function runDiscoveryRound(jobs, resolved, identifierPrefix) {
	const saved = saveAmbient();
	ACTIVE_PU_WARM_PLANS.length = 0;
	CURRENT_PU_WARM_CLAIMS = null;
	ID_COUNTER = 0;
	ID_PREFIX = identifierPrefix;
	NONCE_ATTR = "";
	ASYNC_SCOPE = "";
	MARKERS = true;
	VT_SSR_TRY_SEQ = 0;
	VT_SSR_HAS_CANDIDATES = false;
	VT_SSR_STACK.length = 0;
	CSS = /* @__PURE__ */ new Map();
	HEAD = {
		html: "",
		hints: /* @__PURE__ */ new Set()
	};
	const suspended = SUSPENDED = [];
	SERIAL = [];
	const deferred = DEFERRED = [];
	RESOLVED = resolved;
	CURRENT_SSR_ELEMENT = null;
	SSR_NESTING_WARNINGS = null;
	FRAME = null;
	CURRENT_COMP = null;
	CURRENT_PROPS = null;
	CURRENT_PARENT_SCOPE = null;
	try {
		for (let i = 0; i < jobs.length; i++) {
			const job = jobs[i];
			const frame = {
				parent: job.frame.parent,
				seg: job.frame.seg,
				nextChild: 0,
				scopedChildren: null,
				occ: null,
				path: null,
				deferred: false,
				asyncScope: job.frame.asyncScope
			};
			try {
				renderComponentFramed(job.comp, job.props, job.parentScope, frame);
			} catch (err) {
				if (!ssrIsSuspense(err)) continue;
			}
		}
	} finally {
		restoreAmbient(saved);
	}
	return {
		suspended,
		deferred
	};
}
async function raceSettleGuards(work, timeoutMs, signal) {
	const racers = [work];
	let timer;
	let removeAbort;
	if (timeoutMs > 0) racers.push(new Promise((_, reject) => {
		timer = setTimeout(() => reject(/* @__PURE__ */ new Error("octane SSR: a use(thenable) did not settle within " + timeoutMs + "ms.")), timeoutMs);
		timer?.unref?.();
	}));
	if (signal) racers.push(new Promise((_, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		removeAbort = () => signal.removeEventListener("abort", onAbort);
	}));
	try {
		await (racers.length === 1 ? work : Promise.race(racers));
	} finally {
		clearTimeout(timer);
		removeAbort?.();
	}
}
async function settleSuspended(suspended, resolved, timeoutMs, signal) {
	const pu = resolved.pu;
	await raceSettleGuards(Promise.all(suspended.map(async ({ promise, key }) => {
		if (resolved.has(key)) return;
		const isPu = key.charCodeAt(0) === 124 && key.startsWith("|pu#");
		try {
			const outcome = { value: await promise };
			resolved.set(key, outcome);
			if (isPu) pu.resolvedT.set(promise, outcome);
		} catch (reason) {
			const outcome = { reason };
			resolved.set(key, outcome);
			if (isPu) pu.resolvedT.set(promise, outcome);
		}
	})), timeoutMs, signal);
}
var yieldMacrotask = typeof setImmediate === "function" ? () => new Promise((resolve) => setImmediate(resolve)) : () => new Promise((resolve) => setTimeout(resolve, 0));
async function settleFirstOfWave(suspended, resolved, timeoutMs, signal) {
	const pu = resolved.pu;
	const recorders = [];
	for (const { promise, key } of suspended) {
		if (resolved.has(key)) continue;
		const isPu = key.startsWith("|pu#");
		recorders.push((async () => {
			try {
				const value = await promise;
				if (!resolved.has(key)) resolved.set(key, { value });
				if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, { value });
			} catch (reason) {
				if (!resolved.has(key)) resolved.set(key, { reason });
				if (isPu && !pu.resolvedT.has(promise)) pu.resolvedT.set(promise, { reason });
			}
		})());
	}
	if (recorders.length === 0) return;
	await raceSettleGuards(Promise.race(recorders), timeoutMs, signal);
	await yieldMacrotask();
	let size = resolved.size;
	for (;;) {
		await Promise.resolve();
		await Promise.resolve();
		if (resolved.size === size) break;
		size = resolved.size;
	}
	signal?.throwIfAborted();
}
async function runBuffered(component, props, options, nonceAttr) {
	const timeoutMs = options?.timeoutMs ?? SUSPENSE_TIMEOUT_MS;
	const signal = options?.signal;
	const identifierPrefix = options?.identifierPrefix ?? "";
	const resolved = newResolvedMap();
	let attempt = 0;
	for (;;) {
		signal?.throwIfAborted();
		let pass;
		try {
			pass = withStream(null, () => runFullFramedPass(component, props, resolved, nonceAttr, identifierPrefix));
		} catch (err) {
			options?.onError?.(err);
			throw err;
		}
		if (pass.suspended.length === 0) return pass;
		let jobs = pass.deferred;
		let pending = pass.suspended;
		for (;;) {
			if (++attempt > MAX_SUSPENSE_PASSES) {
				const err = /* @__PURE__ */ new Error("octane SSR: exceeded 50 suspense passes — a use(thenable) never resolved.");
				options?.onError?.(err);
				throw err;
			}
			await settleSuspended(pending, resolved, timeoutMs, signal);
			if (jobs.length === 0 || !jobs.every((j) => j.frame.parent !== null)) break;
			const round = withStream(null, () => runDiscoveryRound(jobs, resolved, identifierPrefix));
			if (round.suspended.length === 0) break;
			pending = round.suspended;
			jobs = round.deferred;
		}
	}
}
/** Turn a completed pass into the `{ html, css }` result (head folded in, seeds appended). */
function passToResult(pass, nonceAttr) {
	let body = pass.body;
	if (pass.serial.length > 0) body += serializeSuspenseSeeds(pass.serial, nonceAttr);
	const html = spliceHead(body, pass.head);
	return {
		html: pass.vtCandidates ? vtSsrStrip(html) : html,
		css: pass.css
	};
}
/**
* React `react-dom/static` `prerender` — await ALL data (Suspense boundaries
* resolve to their success arm), then return the complete `{ html, css }`. Use
* for SSG / any place that wants fully-resolved HTML with no client fallback.
* This is the buffered, await-everything behaviour of the old `render()`.
*/
async function prerender(entryComponent, props, options) {
	const component = entryComponent;
	const nonceAttr = nonceAttrOf(options);
	return passToResult(await runBuffered(component, props, options, nonceAttr), nonceAttr);
}
var HOSTED_FOREIGN_CONTEXT_READER = null;
function readHostedForeignContext(usable, api) {
	if (usable !== null && typeof usable === "object" && HOSTED_FOREIGN_CONTEXT_READER !== null) return HOSTED_FOREIGN_CONTEXT_READER(usable);
	throw new Error(`${api}(): argument is not a Context nor a thenable`);
}
var STREAM_REALM_SALT = (() => {
	return (globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g, "");
})();
var NEXT_STREAM_TOKEN = 0;
function createStreamToken() {
	return "os" + STREAM_REALM_SALT + "-" + (NEXT_STREAM_TOKEN++).toString(36);
}
var STREAM = null;
function pruneUnrepresentedStreamDescendants(stream, ownerKey, ownerHtml) {
	let removed = true;
	while (removed) {
		removed = false;
		for (const [childKey, child] of stream.boundaries) {
			if (childKey === ownerKey) continue;
			let nearestOwner = null;
			for (let i = child.owners.length - 1; i >= 0; i--) {
				const candidate = child.owners[i];
				if (candidate === ownerKey || stream.boundaries.has(candidate)) {
					nearestOwner = candidate;
					break;
				}
			}
			if (nearestOwner !== ownerKey) continue;
			if (ownerHtml.includes("data-oct-b=\"" + child.id + "\"")) continue;
			stream.boundaries.delete(childKey);
			removed = true;
		}
	}
}
function pruneStreamBoundariesAbsentFromShell(stream, shellBoundaryKeys) {
	for (const key of stream.boundaries.keys()) if (!shellBoundaryKeys.has(key)) stream.boundaries.delete(key);
}
/**
* Compiled `@try` / JSX `<Suspense>` boundary. `siteKey` is the compiler's
* source-position hash; combined with the frame path + per-frame occurrence it
* identifies THIS boundary instance stably across streaming passes. Byte-parity
* contract with the old inline emit (hydration compatibility):
*   success            → ssrBlock(ssrBlock(tryHtml))
*   suspend, @pending  → ssrBlock(ssrBlock(pendingHtml))
*   suspend, no arm    → ssrBlock('')
*   error, @catch      → ssrBlock(ssrBlock(catchHtml))
*   error, no @catch   → rethrow (buffered) / stream fallback for client recovery
* In streaming mode a suspended boundary additionally carries the
* `<template data-oct-b>` sentinel, and a REGISTERED boundary keeps returning
* its pending form (content ships via its segment).
*/
function ssrTry(scope, siteKey, tryFn, pendFn, catchFn, namespace = FRAME?.namespace ?? "html", propagateSuspense = false) {
	VT_SSR_TRY_SEQ++;
	let vtOuter = null;
	if (VT_SSR_STACK.length > 0) {
		const top = VT_SSR_STACK[VT_SSR_STACK.length - 1];
		if (!top.consumed) {
			top.consumed = true;
			vtOuter = top;
		}
	}
	const stream = STREAM;
	const frame = FRAME;
	const base = "@try:" + siteKey;
	let occurrence = 0;
	if (frame !== null) occurrence = nextFrameOccurrence(frame, base);
	const key = asyncFramePath(frame) + "|" + base + "#" + occurrence;
	const outerAsyncScope = ASYNC_SCOPE;
	const armScope = outerAsyncScope + "|@arm:" + siteKey + "#" + occurrence.toString(36) + ":";
	let entry;
	let serialStart = 0;
	let ancestorKeys = [];
	let ownerKeys = [];
	if (stream !== null) {
		stream.activePassBoundaryKeys?.add(key);
		ancestorKeys = stream.activeTryKeys.slice();
		ownerKeys = stream.activeOwnerKeys.slice();
		entry = stream.boundaries.get(key);
		if (entry !== void 0) entry.namespace = namespace;
		if (entry !== void 0 && entry.state === "pending") {
			entry.ancestors = ancestorKeys;
			entry.owners = ownerKeys;
		}
		serialStart = SERIAL !== null ? SERIAL.length : 0;
	}
	const withArmScope = (arm, fn) => {
		const prev = ASYNC_SCOPE;
		ASYNC_SCOPE = armScope + arm;
		try {
			return fn();
		} finally {
			ASYNC_SCOPE = prev;
		}
	};
	const withContentArm = (fn) => withArmScope("content", () => {
		if (stream === null) return fn();
		stream.activeTryKeys.push(key);
		stream.activeOwnerKeys.push(key);
		try {
			return fn();
		} finally {
			stream.activeOwnerKeys.pop();
			stream.activeTryKeys.pop();
		}
	});
	const withPendingArm = (fn) => {
		return withArmScope("pending", () => {
			if (stream === null) return fn();
			stream.activeOwnerKeys.push(key);
			try {
				return fn();
			} finally {
				stream.activeOwnerKeys.pop();
			}
		});
	};
	const withCatchArm = (fn) => withArmScope("catch", () => {
		if (stream === null) return fn();
		stream.activeTryKeys.push(key);
		stream.activeOwnerKeys.push(key);
		try {
			return fn();
		} finally {
			stream.activeOwnerKeys.pop();
			stream.activeTryKeys.pop();
		}
	});
	const outerIdPrefix = ID_PREFIX;
	const outerIdCounter = ID_COUNTER;
	let boundaryIds = false;
	const enterBoundaryIds = (next) => {
		if (entry === void 0) return;
		ID_PREFIX = outerIdPrefix + "b" + entry.id + "-";
		ID_COUNTER = next;
		boundaryIds = true;
	};
	const restoreOuterIds = () => {
		ID_PREFIX = outerIdPrefix;
		ID_COUNTER = outerIdCounter;
		boundaryIds = false;
	};
	if (entry !== void 0) enterBoundaryIds(0);
	const pendingForm = () => {
		const renderFallback = () => withPendingArm(() => pendFn !== null ? vtSsrClaimArm(ssrBlock(pendFn(void 0, scope)), "exit") : "");
		let fallback;
		if (entry !== void 0 && entry.state === "done") {
			const suspendedStart = SUSPENDED?.length ?? 0;
			const deferredStart = DEFERRED?.length ?? 0;
			const serialStart = SERIAL?.length ?? 0;
			const css = CSS;
			const cssSnapshot = css === null ? null : new Map(css);
			const head = HEAD;
			const headHtml = head?.html;
			const headHints = head === null ? null : new Set(head.hints);
			const vtTrySeq = VT_SSR_TRY_SEQ;
			const vtHasCandidates = VT_SSR_HAS_CANDIDATES;
			const vtStack = VT_SSR_STACK.map((candidate) => ({
				candidate,
				consumed: candidate.consumed
			}));
			try {
				fallback = withStream(null, renderFallback);
			} catch (error) {
				if (!ssrIsSuspense(error)) throw error;
				fallback = "";
			} finally {
				if (SUSPENDED !== null) SUSPENDED.length = suspendedStart;
				if (DEFERRED !== null) DEFERRED.length = deferredStart;
				if (SERIAL !== null) SERIAL.length = serialStart;
				if (css !== null && cssSnapshot !== null) {
					css.clear();
					for (const [hash, sheet] of cssSnapshot) css.set(hash, sheet);
				}
				if (head !== null && headHints !== null) {
					head.html = headHtml;
					head.hints.clear();
					for (const hint of headHints) head.hints.add(hint);
				}
				VT_SSR_TRY_SEQ = vtTrySeq;
				VT_SSR_HAS_CANDIDATES = vtHasCandidates;
				VT_SSR_STACK.length = 0;
				for (const snapshot of vtStack) {
					snapshot.candidate.consumed = snapshot.consumed;
					VT_SSR_STACK.push(snapshot.candidate);
				}
			}
		} else fallback = renderFallback();
		if (entry !== void 0) return ssrBlock("<template " + STREAM_BOUNDARY_ATTR + "=\"" + entry.id + "\"></template>" + fallback);
		return ssrBlock(pendFn !== null ? fallback : "");
	};
	try {
		try {
			const inner = vtSsrClaimArm(ssrBlock(withContentArm(() => tryFn(void 0, scope))), "enter");
			if (entry !== void 0) {
				if (entry.state === "pending") {
					entry.state = "done";
					entry.html = vtOuter !== null ? vtSsrAnnotate(inner, [
						["vt-name", vtOuter.name],
						["vt-update", vtOuter.update],
						["vt-share", vtOuter.share]
					]) : inner;
					if (SERIAL !== null) {
						entry.seeds = SERIAL.slice(serialStart);
						SERIAL.length = serialStart;
					}
					pruneUnrepresentedStreamDescendants(stream, key, entry.html);
				} else if (SERIAL !== null) SERIAL.length = serialStart;
				ID_COUNTER = entry.pendingIdOffset;
				return pendingForm();
			}
			return ssrBlock(inner);
		} catch (e) {
			if (ssrIsSuspense(e)) {
				if (propagateSuspense) throw e;
				if (stream !== null) {
					if (SERIAL !== null) SERIAL.length = serialStart;
					if (entry === void 0) {
						const pendingIdOffset = Math.max(0, ID_COUNTER - outerIdCounter);
						restoreOuterIds();
						const order = stream.nextId++;
						entry = {
							id: stream.token + "-" + order.toString(36),
							order,
							state: "pending",
							html: "",
							seeds: [],
							pendingIdOffset,
							namespace,
							ancestors: ancestorKeys,
							owners: ownerKeys
						};
						stream.boundaries.set(key, entry);
						enterBoundaryIds(pendingIdOffset);
					} else ID_COUNTER = entry.pendingIdOffset;
				}
				return pendingForm();
			}
			if (catchFn !== null) {
				const caughtSeeds = entry !== void 0 && SERIAL !== null ? SERIAL.slice(serialStart) : [];
				if (entry !== void 0 && SERIAL !== null) SERIAL.length = serialStart;
				const inner = ssrBlock(withCatchArm(() => catchFn(e, scope, NOOP)));
				if (entry !== void 0) {
					if (entry.state !== "done") {
						if (SERIAL !== null) {
							caughtSeeds.push(...SERIAL.slice(serialStart));
							SERIAL.length = serialStart;
						}
						entry.state = "done";
						entry.html = inner;
						entry.seeds = caughtSeeds;
						pruneUnrepresentedStreamDescendants(stream, key, entry.html);
					} else if (SERIAL !== null) SERIAL.length = serialStart;
					ID_COUNTER = entry.pendingIdOffset;
					return pendingForm();
				}
				return ssrBlock(inner);
			}
			if (stream !== null) {
				if (SERIAL !== null) SERIAL.length = serialStart;
				if (entry === void 0) {
					const pendingIdOffset = Math.max(0, ID_COUNTER - outerIdCounter);
					restoreOuterIds();
					const order = stream.nextId++;
					entry = {
						id: stream.token + "-" + order.toString(36),
						order,
						state: "errored",
						error: e,
						html: "",
						seeds: [],
						pendingIdOffset,
						namespace,
						ancestors: ancestorKeys,
						owners: ownerKeys
					};
					stream.boundaries.set(key, entry);
					enterBoundaryIds(pendingIdOffset);
				} else if (entry.state === "pending") {
					entry.state = "errored";
					entry.error = e;
					ID_COUNTER = entry.pendingIdOffset;
				} else if (entry.state === "errored") ID_COUNTER = entry.pendingIdOffset;
				else throw e;
				const fallback = pendingForm();
				pruneUnrepresentedStreamDescendants(stream, key, fallback);
				return fallback;
			}
			throw e;
		}
	} finally {
		ASYNC_SCOPE = outerAsyncScope;
		if (boundaryIds) restoreOuterIds();
	}
}
var STREAM_RUNTIME_JS = "(function(){var d=document;var S=window.$OCTS=window.$OCTS||{};var M=function(v,c){if(v===c)return 1;if(!v||v.charAt(0)!==c)return 0;var s=v.slice(1),n=+s;return n>=2&&Number.isSafeInteger(n)&&String(n)===s;};window.$OCTRC=function(id,nc){var t=d.querySelector('template[" + STREAM_BOUNDARY_ATTR + "=\"'+id+'\"]');var s=d.querySelector('[" + STREAM_SEGMENT_ATTR + "=\"'+id+'\"]');if(!s)return;if(!t){s.remove();return;}var q=s.firstElementChild,z=d.createElement(\"template\"),c=s;if(q&&q.localName===\"script\"){try{z.innerHTML=JSON.parse(q.textContent);c=z.content;}catch(e){return;}}var sd=c.querySelector(\"script[" + STREAM_SEED_ATTR + "]\");if(sd){S[id]=sd.textContent;sd.parentNode.removeChild(sd);}if(nc)c=c.firstElementChild;var n=t.nextSibling,depth=1;while(n){var x=n.nextSibling,v=n.nodeType===8?n.data:null;if(M(v,\"[\"))depth++;else if(M(v,\"]\")){depth--;if(depth===0)break;}n.parentNode.removeChild(n);n=x;}var p=t.parentNode;while(c.firstChild)p.insertBefore(c.firstChild,n);p.replaceChild(d.createComment(\"" + STREAM_SEED_COMMENT + "\"+id),t);s.parentNode.removeChild(s);};window.$OCTRX=function(id){var t=d.querySelector('template[" + STREAM_BOUNDARY_ATTR + "=\"'+id+'\"]');if(t)t.setAttribute(\"data-oct-err\",\"\");};})();";
function withStream(stream, fn) {
	const prev = STREAM;
	STREAM = stream;
	try {
		return fn();
	} finally {
		STREAM = prev;
	}
}
var DOCUMENT_TAIL_RE = /^<\/body>(?:\s|<!--[^]*?-->)*<\/html>(?:\s|<!--[^]*?-->)*$/;
function documentTailStart(body) {
	const index = body.lastIndexOf("</body>");
	if (index === -1) return -1;
	return DOCUMENT_TAIL_RE.test(body.slice(index)) ? index : -1;
}
function isDocumentRoot(body) {
	let i = 0;
	while (body.startsWith("<!--[-->", i)) i += 8;
	if (!body.startsWith("<html", i)) return false;
	const next = body.charCodeAt(i + 5);
	return next === 62 || next === 32 || next === 9 || next === 10 || next === 13;
}
function documentHeadInsertionPoint(body) {
	let searchFrom = 0;
	for (;;) {
		const start = body.indexOf("<head", searchFrom);
		if (start === -1) return -1;
		const next = body.charCodeAt(start + 5);
		if (next === 62) return start + 6;
		if (next === 32 || next === 9 || next === 10 || next === 13) {
			let quote = 0;
			for (let i = start + 6; i < body.length; i++) {
				const code = body.charCodeAt(i);
				if (quote !== 0) {
					if (code === quote) quote = 0;
				} else if (code === 34 || code === 39) quote = code;
				else if (code === 62) return i + 1;
			}
			return -1;
		}
		searchFrom = start + 5;
	}
}
function segmentChunk(b, nonceAttr) {
	let seedScript = "";
	if (b.seeds.length > 0) {
		const json = serializeSuspenseSeedJson(b.seeds);
		seedScript = "<script type=\"application/json\" " + STREAM_SEED_ATTR + nonceAttr + ">" + json + "<\/script>";
	}
	const html = vtSsrStrip(b.html);
	const content = b.namespace === "svg" ? seedScript + "<svg>" + html + "</svg>" : b.namespace === "mathml" ? seedScript + "<math>" + html + "</math>" : seedScript + html;
	const hasNamespaceCarrier = b.namespace === "html" ? "" : ",1";
	const payload = JSON.stringify(content).replace(/</g, "\\u003c");
	return "<div hidden " + STREAM_SEGMENT_ATTR + "=\"" + escapeAttr(b.id) + "\"><script type=\"application/json\" " + STREAM_SCRIPT_ATTR + nonceAttr + ">" + payload + "<\/script></div><script " + STREAM_SCRIPT_ATTR + nonceAttr + ">$OCTRC(" + JSON.stringify(b.id).replace(/</g, "\\u003c") + hasNamespaceCarrier + ")<\/script>";
}
function boundaryErrorChunk(b, nonceAttr) {
	return "<script " + STREAM_SCRIPT_ATTR + nonceAttr + ">$OCTRX(" + JSON.stringify(b.id).replace(/</g, "\\u003c") + ")<\/script>";
}
/** The shared streaming engine both public APIs drive. */
async function runStream(component, props, options, sink) {
	const timeoutMs = options?.timeoutMs ?? SUSPENSE_TIMEOUT_MS;
	const signal = options?.signal;
	const nonceAttr = nonceAttrOf(options);
	const identifierPrefix = options?.identifierPrefix ?? "";
	const resolved = newResolvedMap();
	const stream = {
		boundaries: /* @__PURE__ */ new Map(),
		nextId: 0,
		token: createStreamToken(),
		activePassBoundaryKeys: null,
		activeTryKeys: [],
		activeOwnerKeys: []
	};
	const renderFullPass = () => {
		const boundaryKeys = /* @__PURE__ */ new Set();
		const previousBoundaryKeys = stream.activePassBoundaryKeys;
		stream.activePassBoundaryKeys = boundaryKeys;
		try {
			return {
				pass: withStream(stream, () => runFullFramedPass(component, props, resolved, nonceAttr, identifierPrefix)),
				boundaryKeys
			};
		} finally {
			stream.activePassBoundaryKeys = previousBoundaryKeys;
		}
	};
	const injection = options?.injection;
	if (injection !== void 0) injection.done.then(NOOP, NOOP);
	let injectionUnsubscribe;
	let injectionFailure;
	let injectionFailed = false;
	let signalInjectionFailure;
	const failInjection = (err) => {
		if (injectionFailed) return;
		injectionFailed = true;
		injectionFailure = err;
		signalInjectionFailure?.();
	};
	let writeChain = injection === void 0 ? null : Promise.resolve();
	const write = injection === void 0 ? (chunk, terminal) => sink.write(chunk, terminal) : (chunk, terminal) => {
		const operation = writeChain.then(() => sink.write(chunk, terminal));
		writeChain = operation.then(NOOP, NOOP);
		return operation;
	};
	const drainInjection = () => {
		if (injection === void 0 || injectionFailed) return;
		let html;
		try {
			html = injection.take();
		} catch (err) {
			failInjection(err);
			return;
		}
		if (!html) return;
		return write(html);
	};
	const notifyInjection = () => {
		const drained = drainInjection();
		if (drained !== void 0) drained.catch(NOOP);
	};
	/** Resolves when `done` settles; rejects on abort, take() failure, or done rejection. */
	const waitForInjectionDone = () => new Promise((resolve, reject) => {
		let settled = false;
		const finish = (fn) => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", onAbort);
			signalInjectionFailure = void 0;
			fn();
		};
		const onAbort = () => finish(() => reject(signal.reason));
		signalInjectionFailure = () => finish(() => reject(injectionFailure));
		if (injectionFailed) return finish(() => reject(injectionFailure));
		if (signal?.aborted) return onAbort();
		signal?.addEventListener("abort", onAbort, { once: true });
		injection.done.then(() => finish(resolve), (err) => finish(() => reject(err)));
	});
	const emittedCss = /* @__PURE__ */ new Set();
	const flushedSegments = /* @__PURE__ */ new Set();
	const observedDone = /* @__PURE__ */ new Set();
	const reachableDoneSegments = () => {
		const done = [];
		const reachable = new Set(flushedSegments);
		for (;;) {
			const next = [...stream.boundaries.values()].filter((boundary) => {
				if (boundary.state !== "done" || reachable.has(boundary.id)) return false;
				for (let i = boundary.ancestors.length - 1; i >= 0; i--) {
					const ancestor = stream.boundaries.get(boundary.ancestors[i]);
					if (ancestor !== void 0) return reachable.has(ancestor.id);
				}
				return true;
			}).sort((a, b) => a.order - b.order);
			if (next.length === 0) return done;
			for (const boundary of next) {
				done.push(boundary);
				reachable.add(boundary.id);
			}
		}
	};
	const reportRecoverableBoundaryErrors = () => {
		for (const boundary of stream.boundaries.values()) {
			if (boundary.state !== "errored" || boundary.errorReported) continue;
			boundary.errorReported = true;
			options?.onError?.(boundary.error);
		}
	};
	const reachableErroredBoundaries = () => [...stream.boundaries.values()].filter((boundary) => {
		if (boundary.state !== "errored" || boundary.errorFlushed) return false;
		for (let i = boundary.ancestors.length - 1; i >= 0; i--) {
			const ancestor = stream.boundaries.get(boundary.ancestors[i]);
			if (ancestor !== void 0) return flushedSegments.has(ancestor.id);
		}
		return true;
	}).sort((a, b) => a.order - b.order);
	const flushRecoverableBoundaryErrors = () => {
		const errors = reachableErroredBoundaries();
		if (errors.length === 0) return;
		let chunk = "";
		for (const boundary of errors) chunk += boundaryErrorChunk(boundary, nonceAttr);
		const errorWrite = write(chunk);
		const markFlushed = () => {
			for (const boundary of errors) boundary.errorFlushed = true;
		};
		if (errorWrite === void 0) {
			markFlushed();
			return;
		}
		return errorWrite.then(markFlushed);
	};
	let pass;
	let shellBoundaryKeys;
	let preShellSuspended = [];
	try {
		signal?.throwIfAborted();
		({pass, boundaryKeys: shellBoundaryKeys} = renderFullPass());
		preShellSuspended = pass.suspended;
		signal?.throwIfAborted();
		let rootAttempts = 0;
		while (pass.rootSuspended) {
			if (pass.suspended.length === 0) throw new Error("octane SSR: a root suspension no longer has resumable work.");
			if (++rootAttempts > MAX_SUSPENSE_PASSES) throw new Error("octane SSR: 50 root streaming passes completed without producing a shell.");
			await settleFirstOfWave(pass.suspended, resolved, timeoutMs, signal);
			({pass, boundaryKeys: shellBoundaryKeys} = renderFullPass());
			preShellSuspended = pass.suspended;
			signal?.throwIfAborted();
		}
		pruneStreamBoundariesAbsentFromShell(stream, shellBoundaryKeys);
	} catch (err) {
		const reports = signal?.aborted ? Math.max(1, preShellSuspended.length) : 1;
		for (let i = 0; i < reports; i++) options?.onError?.(err);
		sink.shellError(err);
		return;
	}
	reportRecoverableBoundaryErrors();
	let leadingStyles = "";
	for (const [hash, sheet] of pass.cssEntries) {
		emittedCss.add(hash);
		leadingStyles += "<style data-octane=\"" + hash + "\"" + nonceAttr + ">" + escapeEntireInlineStyleContent(sheet) + "</style>";
	}
	const documentRoot = isDocumentRoot(pass.body);
	let shell = documentRoot ? "<!DOCTYPE html>" : "";
	let heldDocumentTail = "";
	if (injection !== void 0 && documentRoot) {
		const tailStart = documentTailStart(pass.body);
		if (tailStart !== -1) {
			heldDocumentTail = pass.body.slice(tailStart);
			const bodyHtml = pass.body.slice(0, tailStart);
			const headInsert = documentHeadInsertionPoint(bodyHtml);
			shell += headInsert !== -1 ? bodyHtml.slice(0, headInsert) + leadingStyles + pass.head + bodyHtml.slice(headInsert) : leadingStyles + pass.head + bodyHtml;
		} else shell += leadingStyles + pass.head + pass.body;
	} else shell += leadingStyles + pass.head + pass.body;
	if (pass.serial.length > 0) shell += serializeSuspenseSeeds(pass.serial, nonceAttr);
	if (stream.boundaries.size > 0) shell += "<script " + STREAM_SCRIPT_ATTR + nonceAttr + ">" + STREAM_RUNTIME_JS + "<\/script>";
	try {
		const shellWrite = write(pass.vtCandidates ? vtSsrStrip(shell) : shell);
		if (shellWrite !== void 0) await shellWrite;
	} catch (err) {
		options?.onError?.(err);
		sink.shellError(err);
		return;
	}
	sink.shellReady();
	if (injection !== void 0) {
		try {
			injectionUnsubscribe = injection.subscribe(notifyInjection);
		} catch (err) {
			failInjection(err);
		}
		notifyInjection();
	}
	let suspended = pass.suspended;
	let attempt = 0;
	try {
		const initiallyDone = reachableDoneSegments();
		if (initiallyDone.length > 0) {
			let chunk = "";
			for (const boundary of initiallyDone) chunk += segmentChunk(boundary, nonceAttr);
			const segmentWrite = write(pass.vtCandidates ? vtSsrStrip(chunk) : chunk);
			if (segmentWrite !== void 0) await segmentWrite;
			for (const boundary of initiallyDone) {
				flushedSegments.add(boundary.id);
				observedDone.add(boundary.id);
			}
		}
		const initialErrorWrite = flushRecoverableBoundaryErrors();
		if (initialErrorWrite !== void 0) await initialErrorWrite;
		while ([...stream.boundaries.values()].some((b) => b.state === "pending")) {
			signal?.throwIfAborted();
			if (suspended.length === 0) throw new Error("octane SSR: a pending streamed boundary no longer has resumable work; its error escaped to an ancestor that was already flushed.");
			if (++attempt > MAX_SUSPENSE_PASSES) throw new Error("octane SSR: 50 consecutive streaming passes completed no boundary — a use(thenable) never resolved.");
			await settleFirstOfWave(suspended, resolved, timeoutMs, signal);
			pass = renderFullPass().pass;
			suspended = pass.suspended;
			reportRecoverableBoundaryErrors();
			let chunk = "";
			for (const [hash, sheet] of pass.cssEntries) {
				if (emittedCss.has(hash)) continue;
				emittedCss.add(hash);
				chunk += "<style data-octane=\"" + hash + "\"" + nonceAttr + ">" + escapeEntireInlineStyleContent(sheet) + "</style>";
			}
			let madeProgress = false;
			for (const boundary of stream.boundaries.values()) if (boundary.state === "done" && !observedDone.has(boundary.id)) {
				observedDone.add(boundary.id);
				madeProgress = true;
			}
			if (madeProgress) attempt = 0;
			const done = reachableDoneSegments();
			for (const b of done) chunk += segmentChunk(b, nonceAttr);
			if (chunk !== "") {
				const segmentWrite = write(pass.vtCandidates ? vtSsrStrip(chunk) : chunk);
				if (segmentWrite !== void 0) await segmentWrite;
				for (const b of done) flushedSegments.add(b.id);
			}
			const errorWrite = flushRecoverableBoundaryErrors();
			if (errorWrite !== void 0) await errorWrite;
		}
	} catch (err) {
		const pendingBoundaryCount = [...stream.boundaries.values()].filter((boundary) => boundary.state === "pending" && !flushedSegments.has(boundary.id)).length;
		const reports = signal?.aborted ? Math.max(1, pendingBoundaryCount) : 1;
		for (let i = 0; i < reports; i++) options?.onError?.(err);
		if (injection !== void 0) {
			injectionUnsubscribe?.();
			injectionUnsubscribe = void 0;
			try {
				injection.renderComplete?.();
			} catch {}
		}
		let tail = "";
		if (injection !== void 0 && !injectionFailed) try {
			tail += injection.take();
		} catch {}
		for (const b of stream.boundaries.values()) if (!flushedSegments.has(b.id) && !b.errorFlushed) tail += boundaryErrorChunk(b, nonceAttr);
		if (heldDocumentTail !== "") tail += heldDocumentTail;
		if (tail !== "") try {
			const terminalWrite = write(tail, true);
			if (terminalWrite !== void 0) await terminalWrite;
		} catch {}
		sink.fatal(err);
		return;
	}
	if (injection !== void 0) {
		try {
			injection.renderComplete?.();
		} catch (err) {
			failInjection(err);
		}
		try {
			await waitForInjectionDone();
			const finalDrain = drainInjection();
			if (finalDrain !== void 0) await finalDrain;
			if (injectionFailed) throw injectionFailure;
			if (heldDocumentTail !== "") {
				const tailChunk = heldDocumentTail;
				heldDocumentTail = "";
				const tailWrite = write(tailChunk);
				if (tailWrite !== void 0) await tailWrite;
			}
		} catch (err) {
			options?.onError?.(err);
			injectionUnsubscribe?.();
			injectionUnsubscribe = void 0;
			let terminal = "";
			if (!injectionFailed) try {
				terminal = injection.take();
			} catch {}
			terminal += heldDocumentTail;
			if (terminal !== "") try {
				const terminalWrite = write(terminal, true);
				if (terminalWrite !== void 0) await terminalWrite;
			} catch {}
			sink.fatal(err);
			return;
		}
		injectionUnsubscribe?.();
	}
	sink.allReady();
}
/**
* React `react-dom/server` `renderToReadableStream` (web streams). Resolves
* with the ReadableStream once the shell is ready (rejects on a shell error);
* the stream's `allReady` promise settles when every boundary chunk has been
* accepted under consumer backpressure. A consumer that pauses pulling also
* pauses `allReady`; read concurrently when waiting for it.
*/
function renderToReadableStream(entryComponent, props, options) {
	const component = entryComponent;
	return new Promise((resolveShell, rejectShell) => {
		const encoder = new TextEncoder();
		const renderController = new AbortController();
		let removeOuterAbort;
		if (options?.signal) {
			const outer = options.signal;
			if (outer.aborted) renderController.abort(outer.reason);
			else {
				const onAbort = () => renderController.abort(outer.reason);
				outer.addEventListener("abort", onAbort, { once: true });
				removeOuterAbort = () => outer.removeEventListener("abort", onAbort);
			}
		}
		let readableController;
		let wakeDemand = null;
		let consumerCancelled = false;
		let cancelReason;
		let closed = false;
		let allReadyResolve;
		let allReadyReject;
		const allReady = new Promise((res, rej) => {
			allReadyResolve = res;
			allReadyReject = rej;
		});
		allReady.catch(() => {});
		const wakeWriter = () => {
			const wake = wakeDemand;
			wakeDemand = null;
			wake?.();
		};
		const stream = new ReadableStream({
			start(c) {
				readableController = c;
			},
			pull() {
				wakeWriter();
			},
			cancel(reason) {
				if (closed) return;
				consumerCancelled = true;
				cancelReason = reason ?? /* @__PURE__ */ new Error("The stream consumer cancelled.");
				removeOuterAbort?.();
				renderController.abort(cancelReason);
				wakeWriter();
			}
		});
		stream.allReady = allReady;
		let shellDone = false;
		const waitForDemand = () => new Promise((resolve, reject) => {
			let settled = false;
			const cleanup = () => {
				renderController.signal.removeEventListener("abort", onAbort);
			};
			const finish = (fn) => {
				if (settled) return;
				settled = true;
				cleanup();
				if (wakeDemand === onDemand) wakeDemand = null;
				fn();
			};
			const onDemand = () => finish(resolve);
			const onAbort = () => finish(() => reject(renderController.signal.reason));
			wakeDemand = onDemand;
			if (renderController.signal.aborted) onAbort();
			else renderController.signal.addEventListener("abort", onAbort, { once: true });
		});
		const writeReadable = (chunk, terminal = false) => {
			if (closed || consumerCancelled) return Promise.reject(cancelReason ?? /* @__PURE__ */ new Error("The readable stream is closed."));
			if (!terminal && renderController.signal.aborted) return Promise.reject(renderController.signal.reason);
			const bytes = encoder.encode(chunk);
			if (terminal) {
				readableController.enqueue(bytes);
				return;
			}
			if ((readableController.desiredSize ?? 0) > 0) {
				readableController.enqueue(bytes);
				return;
			}
			return (async () => {
				while ((readableController.desiredSize ?? 0) <= 0) {
					await waitForDemand();
					if (closed || consumerCancelled) throw cancelReason ?? /* @__PURE__ */ new Error("The readable stream is closed.");
				}
				readableController.enqueue(bytes);
			})();
		};
		const closeReadable = () => {
			if (closed || consumerCancelled) return;
			closed = true;
			removeOuterAbort?.();
			wakeWriter();
			try {
				readableController.close();
			} catch {}
		};
		runStream(component, props, {
			...options,
			signal: renderController.signal
		}, {
			write(chunk, terminal) {
				return writeReadable(chunk, terminal);
			},
			shellReady() {
				shellDone = true;
				options?.onShellReady?.();
				resolveShell(stream);
			},
			shellError(err) {
				options?.onShellError?.(err);
				if (!shellDone) rejectShell(err);
				allReadyReject(err);
				closeReadable();
			},
			allReady() {
				options?.onAllReady?.();
				allReadyResolve();
				closeReadable();
			},
			fatal(err) {
				allReadyReject(err);
				closeReadable();
			}
		}).catch((err) => {
			options?.onError?.(err);
			if (!shellDone) rejectShell(err);
			allReadyReject(err);
			closeReadable();
		});
	});
}
//#endregion
export { useCallback as A, ssrInnerHtml as C, ssrTry as D, ssrText as E, useSyncExternalStore as F, warmChild as I, withSlot as L, useLayoutEffect as M, useRef as N, startTransition as O, useState as P, ssrHeadEl as S, ssrSnapshotSpread as T, ssrChildText as _, flushSync as a, ssrControl as b, markChildrenBlock as c, renderToReadableStream as d, ssrArm as f, ssrChild as g, ssrBlock as h, createElement as i, useContext as j, use as k, prerender as l, ssrAttrs as m, Suspense as n, hookSlots as o, ssrAttr as p, createContext as r, isChildrenBlock as s, HYDRATION_RANGE_BOUNDARY as t, puBatch as u, ssrChildrenSources as v, ssrScriptInnerHtml as w, ssrForBlock as x, ssrComponent as y };
