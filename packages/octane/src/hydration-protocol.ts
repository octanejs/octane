// The hydration wire protocol: every name and format that SSR writes and the
// client runtime, the stream swap scripts and pre-root capture read back. Both
// sides compare these byte-for-byte, so each has exactly one owner here. The
// module imports nothing and loads no DOM tables: `constants.ts` re-exports its
// public members, but it also imports `dom-tables.js`, so any consumer that
// must stay off the DOM-table graph (the early interaction/control capture and
// `stream-protocol.ts`) imports this leaf directly.
//
// Ranges (version 3). Every hydratable site is one pair of comments:
// - An open's data is `[` followed by nothing or a kind: `f0`/`f1` (an @for,
//   with its server arm), `b;` (a presentation-binding range,
//   dom-binding-protocol.ts) or `$` (a Suspense boundary, below). Any payload
//   may follow the kind; only the kind decides that a comment opens a range.
// - A close is exactly `]`.
// Ranges nest, and nothing else is a range: the text separator `<!-- -->`, the
// empty-text stand-in `<!---->` and the `<!--frag-->` pair are single nodes.
//
// A component call's range is its frame, and a value the component returns
// renders directly inside it (version 3), as do the values of components it
// returns in turn. A call that inherits its parent's range instead (the sole
// root of a `@{}` body) has no frame and renders its value in that range. A
// root's output has no range, so a value the root returns keeps one of its own.
//
// A list item has a range of its own unless it renders exactly one host
// element, which then delimits the item. A compiled `@for` row is one when the
// compiler proves its body renders one element; a descriptor list decides per
// item value (selfDelimits).
//
// A Suspense boundary is one range whose opening comment carries its state,
// with the boundary's content directly inside:
// - `[$:N`  the server rendered the content. N counts the `useId()` values it
//           reserved. Seed scripts for the content may lead it.
// - `[$?id` a streamed boundary. While its `<template data-oct-b="id">`
//           sentinel leads the range, the content shown is the fallback. The
//           swap script removes the sentinel, and the content's seeds wait on
//           `window.$OCTS[id]`.
// - `[$!rN` the client renders the boundary. r says why the server could not:
//           `e` it threw, `s` it suspended in a synchronous render, `n` it read
//           a value that cannot be sent to the client, `c` an authored catch
//           handled the error. N is as above. A catch is retried with client
//           data; the server's error is never serialized to the client.
// - `[$!gid` a catch boundary whose primary contains a pending descendant. Its
//           leading stream sentinel lets the server replace the whole boundary
//           if that descendant later throws. Client activation claims it. The
//           opaque id is not a valid count, so older readers reject this state.
// A boundary without a fallback whose content rendered is an ordinary `[`
// range. A presentation-binding view keeps its own boundary shape (see
// SUSPENSE_RESOLVED_COMMENT below).

/** Inert compiler/bundler manifest for one independently activatable boundary. */
export const INDEPENDENT_HYDRATE_MANIFEST_ATTR = 'data-octane-independent';
export const HYDRATE_INDEPENDENT_ATTR = 'data-octane-hydrate-independent';
/** Compiler-owned stable key for a native control that can receive input before activation. */
export const HYDRATE_INPUT_ATTR = 'data-octane-input';
/** Server-only writable-signal identity joined to a compiler control site. */
export const SIGNAL_CONTROL_ATTR = 'data-octane-signal-control';

/** Stable id of a server-rendered deferred hydration boundary. */
export const HYDRATE_ID_ATTR = 'data-octane-hydrate-id';
/** Serialized strategy kind (`visible`, `idle`, `dynamic`, …). */
export const HYDRATE_WHEN_ATTR = 'data-octane-hydrate-when';
// The built-in strategy parameters an independent wrapper serializes live in
// `hydration/strategy-attributes.ts`, so the client reaches them only on demand.
/** Number of `useId()` slots consumed while rendering the deferred child. */
export const HYDRATE_ID_COUNT_ATTR = 'data-octane-hydrate-id-count';
/** Direct-child JSON script carrying this boundary's `use()` seed slice. */
export const HYDRATE_SEED_ATTR = 'data-octane-hydrate-seed';
/** Matches any server-rendered deferred hydration boundary wrapper. */
export const HYDRATE_MARKER_SELECTOR = '[data-octane-hydrate-id]';

/**
 * The range protocol version above. A comment whose data is the version opens
 * every hydratable root's output, and an independent `<Hydrate>` island's,
 * whether or not it seeds anything. Only head metadata folded into a fragment
 * root, or a streamed document's doctype, precedes it. A root whose server
 * spoke another version, or named none, renders on the client instead of
 * adopting ranges it would misread. Like a range's comments, it stays.
 */
export const HYDRATION_PROTOCOL_VERSION = '3';

// The payloads below stay plain literals rather than deriving the longer ones
// from the shorter. A bundler does not constant-fold a cross-module template
// literal, so a derived spelling reaches every output as a runtime concat: it
// measured +24 raw bytes on the pre-root capture entry alone. Downstream
// modules still derive THEIR prefixes from these, which costs nothing they do
// not already pay for the import.
/** Payload of a plain range open. */
export const HYDRATION_START = '[';
/** Payload of every range close. */
export const HYDRATION_END = ']';
/** Leading payload shared by both `@for` outer-open markers. */
export const HYDRATION_FOR_PREFIX = '[f';
/** @for outer-open payload: the server rendered its @empty arm. */
export const HYDRATION_FOR_EMPTY = '[f0';
/** @for outer-open payload: the server rendered one or more direct-host items. */
export const HYDRATION_FOR_ITEMS = '[f1';
/** Index of the arm digit ('0' or '1') inside either @for outer-open payload. */
export const HYDRATION_FOR_ARM_INDEX = HYDRATION_FOR_PREFIX.length;
/** Boundary open: the server rendered the content (`[$:N`). */
export const BOUNDARY_CONTENT = '[$:';
/** Boundary open: a streamed boundary (`[$?id`). */
export const BOUNDARY_STREAMED = '[$?';
/** Boundary open: the client renders the boundary (`[$!rN`). */
export const BOUNDARY_CLIENT = '[$!';
/** Catch boundary guarding pending descendants (`[$!gid`). */
export const BOUNDARY_CATCH_GUARD = '[$!g';
/** `[$!` reasons: the server's render threw, suspended, read untransportable values, or caught an error. */
export const BOUNDARY_CLIENT_ERROR = 'e';
export const BOUNDARY_CLIENT_SUSPENDED = 's';
export const BOUNDARY_CLIENT_NATIVE = 'n';
export const BOUNDARY_CLIENT_CAUGHT = 'c';

/** Whether a comment's data opens a range. */
export function isRangeOpen(data: string): boolean {
	if (data === '[') return true;
	if (data.charCodeAt(0) !== 91) return false;
	const kind = data.charCodeAt(1);
	const next = data.charCodeAt(2);
	// `$:` `$?` `$!`, `f0` `f1`, `b;`
	return kind === 36
		? next === 58 || next === 63 || next === 33
		: kind === 102
			? next === 48 || next === 49
			: kind === 98 && next === 59;
}

/**
 * isRangeOpen as regular-expression source, for the inline stream swap script,
 * which cannot import this module. A stream test holds the two equal.
 */
export const RANGE_OPEN_SOURCE = '^\\[(?:$|\\$[:?!]|f[01]|b;)';

/** Whether a comment's data closes a range. */
export function isRangeClose(data: string): boolean {
	return data === ']';
}

/**
 * Whether a descriptor list item whose descriptor type is `type` delimits
 * itself: it is a host element, and nothing in it needs a component's range
 * (`childBlocks`, each side's descNeedsBlocks over the children it renders).
 * The client's de-opt reconciler renders such an item as that one element, and
 * any other item, a host whose children hold a component included, inside a
 * range of its own.
 */
export function selfDelimits(type: unknown, childBlocks: boolean): boolean {
	return typeof type === 'string' && !childBlocks;
}

/**
 * Whether a server text or attribute value matches the client's once the HTML
 * parser's normalization is undone, as ReactDOMComponent compares them: the
 * parser folds CR/CRLF to LF and drops U+0000 or turns it into U+FFFD.
 */
export function parserNormalizedMatch(server: string | null, client: string): boolean {
	return server !== null && normalizeParserText(server) === normalizeParserText(client);
}

function normalizeParserText(value: string): string {
	return value.replace(/\r\n?/g, '\n').replace(/[\u0000\uFFFD]/g, '');
}

/** The `useId()` count a `[$:N` or `[$!rN` open records, or -1 when malformed. */
export function boundaryIdCount(data: string): number {
	const raw = data.slice(data.charCodeAt(2) === 33 ? 4 : 3);
	if (!/^(?:0|[1-9]\d*)$/.test(raw)) return -1;
	const count = Number(raw);
	return Number.isSafeInteger(count) ? count : -1;
}

// A presentation-binding view's `@try` region keeps the boundary shape it was
// built for: its open records the arm, the arm has a range of its own, and
// these comments lead that range. dom-binding-program.ts reads them.
/** Leads a resolved binding-view `@try` arm whose server render reserved sequential IDs. */
export const SUSPENSE_RESOLVED_COMMENT = 'oct-suspense:';
/** Left by the swap script where a streamed binding-view boundary's sentinel was. */
export const STREAM_SEED_COMMENT = 'oct-seed:';
/** Leads a streamed server catch. `:<ids>` marks a buffered binding catch; `:<ids>:<seeds>` marks a revealed guard whose replaced primary reserved those IDs and positional seeds. */
export const STREAM_CATCH_COMMENT = 'oct-catch';
/** A binding-view arm with untransportable demand is mounted fresh within its own range. */
export const NATIVE_SIGNAL_FRESH_COMMENT = 'oct-native-fresh:';

/**
 * Serialize one `useId()` value. The client regenerates the id the server
 * already wrote, so the namespace prefix, the `in-` infix, the base-36 ordinal,
 * and both colons must be produced in exactly one place: a divergence here
 * survives every test that only checks one side and then mismatches every
 * `useId` consumer at hydration.
 */
export function formatUseId(prefix: string, ordinal: number): string {
	return ':' + prefix + 'in-' + ordinal.toString(36) + ':';
}
