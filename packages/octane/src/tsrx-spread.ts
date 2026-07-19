/**
 * Type surface for the shared TSRX transform's host-spread helpers.
 *
 * The volar `typeOnly` virtual TSX rewrites host-element spreads as
 * `__normalize_spread_props(...)` / `__normalize_spread_props_for_ref_attr(...)`
 * and imports both from the platform's `imports.refProp` module — pointing that
 * at THIS subpath makes the names resolve with useful types from every octane
 * consumer. Identity signatures on purpose: normalization is a runtime concern
 * (the real compile emits its own spread handling and never imports this
 * module), so the spread site must type exactly like spreading the bag itself.
 */
export function normalize_spread_props<T>(props: T): T {
	return props;
}

export function normalize_spread_props_for_ref_attr<T>(props: T): T {
	return props;
}
