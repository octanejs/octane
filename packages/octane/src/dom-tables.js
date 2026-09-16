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
export const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
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
export const BOOLEAN_ATTR_PROPS = new Set([
	'allowfullscreen',
	'async',
	'autoplay',
	'controls',
	'credentialless',
	'default',
	'defer',
	'disabled',
	'disablepictureinpicture',
	'disableremoteplayback',
	'formnovalidate',
	'hidden',
	'inert',
	'itemscope',
	'loop',
	'nomodule',
	'novalidate',
	'open',
	'playsinline',
	'readonly',
	'required',
	'reversed',
	'scoped',
	'seamless',
]);

/**
 * React's mustUseProperty set minus value/checked (owned by the controlled
 * machinery): attributes that do NOT reflect to the live DOM property after
 * creation — a dynamic `muted={x}` written as an attribute never (un)mutes a
 * playing element. The client writes the PROPERTY for dynamic values; static
 * literals and SSR keep the attribute (correct initial state). Lowercased.
 */
export const MUST_USE_PROPERTY_PROPS = new Set(['muted', 'multiple', 'selected']);

/**
 * React's positive-numeric props. Values below 1 (including zero and values
 * that do not coerce to a number) are omitted instead of serialized.
 */
export const POSITIVE_NUMERIC_ATTR_PROPS = new Set(['size', 'cols', 'rows', 'span']);

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
export const SVG_ONLY_TAGS = new Set([
	'altGlyph',
	'altGlyphDef',
	'altGlyphItem',
	'animate',
	'animateColor',
	'animateMotion',
	'animateTransform',
	'circle',
	'clipPath',
	'defs',
	'desc',
	'ellipse',
	'feBlend',
	'feColorMatrix',
	'feComponentTransfer',
	'feComposite',
	'feConvolveMatrix',
	'feDiffuseLighting',
	'feDisplacementMap',
	'feDistantLight',
	'feDropShadow',
	'feFlood',
	'feFuncA',
	'feFuncB',
	'feFuncG',
	'feFuncR',
	'feGaussianBlur',
	'feImage',
	'feMerge',
	'feMergeNode',
	'feMorphology',
	'feOffset',
	'fePointLight',
	'feSpecularLighting',
	'feSpotLight',
	'feTile',
	'feTurbulence',
	'filter',
	'font-face',
	'font-face-format',
	'font-face-name',
	'font-face-src',
	'font-face-uri',
	'foreignObject',
	'g',
	'glyph',
	'glyphRef',
	'hkern',
	'image',
	'line',
	'linearGradient',
	'marker',
	'mask',
	'metadata',
	'missing-glyph',
	'mpath',
	'path',
	'pattern',
	'polygon',
	'polyline',
	'radialGradient',
	'rect',
	'set',
	'stop',
	'switch',
	'symbol',
	'text',
	'textPath',
	'tref',
	'tspan',
	'use',
	'view',
	'vkern',
]);

/**
 * Tags that exist ONLY in the HTML namespace (the WHATWG living-standard
 * element set minus every name SVG or MathML also defines), so a component
 * whose root template starts with one is provably an HTML template no matter
 * where the component is later mounted. The compiler uses this to bake the
 * concrete `template(html, 0)` namespace flag instead of the opaque flag 3,
 * which would re-resolve the destination namespace on every clone().
 * Ambiguous names (`a`, `script`, `style`, `title`, `font`) and unknown /
 * legacy tags are deliberately ABSENT — they keep per-clone resolution.
 * Compiler-only (not imported by the runtimes).
 */
export const HTML_ONLY_TAGS = /* @__PURE__ */ new Set([
	'abbr',
	'address',
	'area',
	'article',
	'aside',
	'audio',
	'b',
	'base',
	'bdi',
	'bdo',
	'blockquote',
	'body',
	'br',
	'button',
	'canvas',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'data',
	'datalist',
	'dd',
	'del',
	'details',
	'dfn',
	'dialog',
	'div',
	'dl',
	'dt',
	'em',
	'embed',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'head',
	'header',
	'hgroup',
	'hr',
	'html',
	'i',
	'iframe',
	'img',
	'input',
	'ins',
	'kbd',
	'label',
	'legend',
	'li',
	'link',
	'main',
	'map',
	'mark',
	'menu',
	'meta',
	'meter',
	'nav',
	'noscript',
	'object',
	'ol',
	'optgroup',
	'option',
	'output',
	'p',
	'picture',
	'pre',
	'progress',
	'q',
	'rp',
	'rt',
	'ruby',
	's',
	'samp',
	'search',
	'section',
	'select',
	'slot',
	'small',
	'source',
	'span',
	'strong',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'template',
	'textarea',
	'tfoot',
	'th',
	'thead',
	'time',
	'tr',
	'track',
	'u',
	'ul',
	'var',
	'video',
	'wbr',
]);

/**
 * Tags that exist ONLY in the MathML namespace (no HTML or SVG element shares
 * the name) — the compile-time MathML twin of SVG_ONLY_TAGS, used for the same
 * component-root namespace inference (`template(html, 2)`). `math` itself is
 * handled by the explicit root-tag checks. Compiler-only.
 */
export const MATHML_ONLY_TAGS = /* @__PURE__ */ new Set([
	'annotation',
	'annotation-xml',
	'maction',
	'menclose',
	'merror',
	'mfenced',
	'mfrac',
	'mi',
	'mmultiscripts',
	'mn',
	'mo',
	'mover',
	'mpadded',
	'mphantom',
	'mprescripts',
	'mroot',
	'mrow',
	'ms',
	'mspace',
	'msqrt',
	'mstyle',
	'msub',
	'msubsup',
	'msup',
	'mtable',
	'mtd',
	'mtext',
	'mtr',
	'munder',
	'munderover',
	'semantics',
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
export const ATTRIBUTE_ALIASES = new Map([
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
	// React writes this via a setProp switch case rather than its aliases map;
	// same observable output. Matters on SVG hosts (setAttribute preserves case,
	// and `tabIndex` verbatim is not focusable).
	['tabIndex', 'tabindex'],
]);

/**
 * The three global ENUMERATED attributes whose boolean prop forms must
 * stringify: `false` must WRITE "false" (an ABSENT attribute means "inherit /
 * UA default", a different state), and `true` writes "true". Applies on every
 * element (they're global attributes — custom elements included). Matched
 * case-insensitively: JSX arrives camelCase (`spellCheck`), spreads/de-opt
 * props may arrive lowercase.
 */
export function isEnumeratedBooleanAttr(name) {
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

export { isUnitlessStyleProp, cssStyleValue, hyphenateStyleName } from './style-values.js';
