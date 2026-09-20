// Wire names and formats shared by SSR, the client runtime, and pre-root
// capture without loading DOM tables. `constants.ts` re-exports this module's
// public members, but it also imports `dom-tables.js`, so any consumer that
// must stay off the DOM-table graph (the early interaction/control capture and
// `stream-protocol.ts`) imports this leaf directly. Both sides of a hydration
// boundary compare these byte-for-byte, so they get exactly one owner here.

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
/** Number of `useId()` slots consumed while rendering the deferred child. */
export const HYDRATE_ID_COUNT_ATTR = 'data-octane-hydrate-id-count';
/** Direct-child JSON script carrying this boundary's `use()` seed slice. */
export const HYDRATE_SEED_ATTR = 'data-octane-hydrate-seed';
/** Matches any server-rendered deferred hydration boundary wrapper. */
export const HYDRATE_MARKER_SELECTOR = '[data-octane-hydrate-id]';

// The payloads below stay plain literals rather than deriving the longer ones
// from the shorter. A bundler does not constant-fold a cross-module template
// literal, so a derived spelling reaches every output as a runtime concat: it
// measured +24 raw bytes on the pre-root capture entry alone. Downstream
// modules still derive THEIR prefixes from these, which costs nothing they do
// not already pay for the import.
/** Single-character payload of a block-open comment. */
export const HYDRATION_START = '[';
/** Single-character payload of a block-close comment. */
export const HYDRATION_END = ']';
/** Leading payload shared by both `@for` outer-open markers. */
export const HYDRATION_FOR_PREFIX = '[f';
/** @for outer-open payload: the server rendered its @empty arm. */
export const HYDRATION_FOR_EMPTY = '[f0';
/** @for outer-open payload: the server rendered one or more direct-host items. */
export const HYDRATION_FOR_ITEMS = '[f1';
/** Index of the arm digit ('0' or '1') inside either @for outer-open payload. */
export const HYDRATION_FOR_ARM_INDEX = HYDRATION_FOR_PREFIX.length;

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
