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

/** @for outer-open payload: the server rendered its @empty arm. */
export const HYDRATION_FOR_EMPTY = '[f0';
/** @for outer-open payload: the server rendered one or more direct-host items. */
export const HYDRATION_FOR_ITEMS = '[f1';

/** Opens a hydratable block (component output / control-flow branch). */
export const BLOCK_OPEN = `<!--${HYDRATION_START}-->`;
/** Closes a hydratable block. */
export const BLOCK_CLOSE = `<!--${HYDRATION_END}-->`;
/** Opens an @for range whose server render selected @empty. */
export const FOR_BLOCK_OPEN_EMPTY = `<!--${HYDRATION_FOR_EMPTY}-->`;
/** Opens an @for range whose server render contains items. */
export const FOR_BLOCK_OPEN_ITEMS = `<!--${HYDRATION_FOR_ITEMS}-->`;
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
 * Legacy undefined-sentinel key retained for consumers of `octane/constants`.
 * New seed payloads use the collision-free escaped-string protocol below.
 */
export const UNDEFINED_SENTINEL_KEY = '__octane_new_undefined__';

/**
 * Prefix for collision-free scalar escapes inside SSR Suspense seed JSON.
 * `undefined` is encoded as `${prefix}u`; user strings beginning with the
 * prefix are encoded as `${prefix}s${value}` before JSON serialization.
 */
export const SUSPENSE_SEED_WIRE_PREFIX = '\0octane:ssr-seed:';

/**
 * Top-level envelope key used only when a server hydration-seed stream contains
 * rejected `use(thenable)` entries. Keeping rejection metadata outside the
 * fulfilled value array prevents user data from colliding with the protocol.
 */
export const REJECTION_SENTINEL_KEY = '__octane_new_rejection__';

/**
 * Marks a thenable whose hydration value is owned by an external serializer.
 * Octane still tracks and unwraps it, but does not emit or consume a duplicate
 * suspense seed for that thenable.
 */
export const EXTERNAL_HYDRATION_PROMISE: unique symbol = Symbol.for(
	'octane.external-hydration-promise',
);

/**
 * Allows a logical client root to cross SSR ancestors that live outside the
 * selected hydration container. The root marks itself `passthrough`; the first
 * component whose DOM is inside the container marks itself `owner`.
 */
export const HYDRATION_RANGE_BOUNDARY: unique symbol = Symbol.for(
	'octane.hydration-range-boundary',
);

// ── Deferred hydration boundary protocol (`<Hydrate>`) ──────────────────────────────
// An ordinary boundary is a persistent real `<div>`: visibility/interaction
// strategies and procedural prefetching need an Element to observe. During the
// initial root hydration the client adopts that wrapper but leaves its child
// block dormant. The attributes below carry the stable boundary id, strategy
// kind, and number of useId slots reserved by the dormant child. Resolved `use()`
// values are removed from the root seed stream and stored in a direct-child JSON
// script so the later subtree hydration owns precisely its own seeds. The exact
// compiler-proven permanent-static form instead uses the comment protocol below.
/** Comment prefix carrying skipped `useId()` slots for a wrapper-free permanent-static range. */
export const HYDRATE_STATIC_ID_COUNT_PREFIX = 'octane-static-hydrate:';
/** Closing comment for a wrapper-free permanent-static range. */
export const HYDRATE_STATIC_END = '/octane-static-hydrate';
/** Stable id of a server-rendered deferred hydration boundary. */
export const HYDRATE_ID_ATTR = 'data-octane-hydrate-id';
/** Serialized strategy kind (`visible`, `idle`, `dynamic`, …). */
export const HYDRATE_WHEN_ATTR = 'data-octane-hydrate-when';
/** Number of `useId()` slots consumed while rendering the deferred child. */
export const HYDRATE_ID_COUNT_ATTR = 'data-octane-hydrate-id-count';
/** Opaque renderer stream token authenticating pending descendants owned by this boundary. */
export { HYDRATE_STREAM_TOKEN_ATTR } from './stream-protocol.js';
/** Direct-child JSON script carrying this boundary's `use()` seed slice. */
export const HYDRATE_SEED_ATTR = 'data-octane-hydrate-seed';

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
export { STREAM_BOUNDARY_ATTR } from './stream-protocol.js';
/** Hidden segment container attribute carrying a completed boundary's content. */
export const STREAM_SEGMENT_ATTR = 'data-oct-s';
/** Per-boundary seed-JSON script attribute (inside the segment). */
export const STREAM_SEED_ATTR = 'data-oct-seed';
/** Renderer-owned executable/data scripts emitted by the streaming protocol. */
export const STREAM_SCRIPT_ATTR = 'data-octane-stream';
/** Comment-data prefix left in a swapped boundary for hydration seed scoping. */
export const STREAM_SEED_COMMENT = 'oct-seed:';

// ---------------------------------------------------------------------------
// Attribute value-type tables — React parity where the FUNCTIONAL outcome
// would flip. Shared by the client (`setAttribute`, runtime.ts) and SSR
// (`ssrAttr`, runtime.server.ts) so both sides serialize/write the same
// presence/absence for the same value — otherwise hydration would resurrect
// an attribute SSR omitted (or vice versa) and warn on the divergence.
// Custom elements are exempt everywhere (raw attribute semantics).
//
// The tables themselves live in `dom-tables.js` — a plain-JS module so the
// verbatim-shipped compiler imports the SAME data for its static bakes (see
// its header for the per-table semantics). Re-exported here with explicit
// type annotations so the runtimes' import site and the public
// `octane/constants` surface are unchanged, and the emitted declarations
// stay self-contained.
// ---------------------------------------------------------------------------

import {
	VOID_ELEMENTS as _VOID_ELEMENTS,
	BOOLEAN_ATTR_PROPS as _BOOLEAN_ATTR_PROPS,
	MUST_USE_PROPERTY_PROPS as _MUST_USE_PROPERTY_PROPS,
	POSITIVE_NUMERIC_ATTR_PROPS as _POSITIVE_NUMERIC_ATTR_PROPS,
	SVG_ONLY_TAGS as _SVG_ONLY_TAGS,
	ATTRIBUTE_ALIASES as _ATTRIBUTE_ALIASES,
	isEnumeratedBooleanAttr as _isEnumeratedBooleanAttr,
	isUnitlessStyleProp as _isUnitlessStyleProp,
	cssStyleValue as _cssStyleValue,
} from './dom-tables.js';

/** HTML void elements (no content model). See dom-tables.js. */
export const VOID_ELEMENTS: Set<string> = _VOID_ELEMENTS;

/** React's BOOLEAN attribute props — truthy renders `attr=""`, falsy drops. See dom-tables.js. */
export const BOOLEAN_ATTR_PROPS: Set<string> = _BOOLEAN_ATTR_PROPS;

/** React's mustUseProperty set minus value/checked. See dom-tables.js. */
export const MUST_USE_PROPERTY_PROPS: Set<string> = _MUST_USE_PROPERTY_PROPS;

/**
 * React's POSITIVE-numeric props: values below 1 (incl. 0 and non-numeric)
 * drop — `size="0"` is invalid per the HTML spec (size must be > 0).
 */
export const POSITIVE_NUMERIC_ATTR_PROPS: Set<string> = _POSITIVE_NUMERIC_ATTR_PROPS;

/**
 * Legal HTML attribute name: non-empty, no ASCII whitespace, `"`, `'`, `>`,
 * `/`, `=`, or control chars. Rejects spread keys that would inject markup
 * (e.g. 'x onload=alert(1)'). Shared by the SSR serializer (ssrAttrEntry) and
 * the client's setAttribute (proactive skip — mirrors React's validity gate;
 * the platform would throw InvalidCharacterError).
 */
export const VALID_ATTR_NAME = /^[^\s"'>\/=\u0000-\u001F]+$/;

/**
 * Tags that exist ONLY in the SVG namespace — implies SVG in a
 * namespace-ambiguous position. See dom-tables.js.
 */
export const SVG_ONLY_TAGS: Set<string> = _SVG_ONLY_TAGS;

/**
 * React 19's attribute-alias table — camelCase JSX prop → the attribute the
 * browser actually understands (an ALLOWLIST, not mechanical hyphenation).
 * See dom-tables.js.
 */
export const ATTRIBUTE_ALIASES: Map<string, string> = _ATTRIBUTE_ALIASES;

/**
 * The three global ENUMERATED attributes whose boolean prop forms must
 * stringify (`spellcheck`/`draggable`/`contenteditable`). See dom-tables.js.
 */
export const isEnumeratedBooleanAttr: (name: string) => boolean = _isEnumeratedBooleanAttr;

/** True if `name` (camelCase, kebab, or vendor-prefixed) is a unitless CSS property. */
export const isUnitlessStyleProp: (name: string) => boolean = _isUnitlessStyleProp;

/**
 * Coerce a style-object value to its CSS string, React-style: a bare number gets
 * `px` appended — except `0`, custom properties (`--x`), and unitless properties.
 * See dom-tables.js.
 */
export const cssStyleValue: (name: string, value: unknown) => string = _cssStyleValue;
