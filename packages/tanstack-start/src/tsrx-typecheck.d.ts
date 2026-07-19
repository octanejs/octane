// Type-check-only ambient declarations for the octane .tsrx pipeline.
//
// The .tsrx type-checking transform (`octane/compiler/volar`, run by tsrx-tsc
// and the TSRX language service) rewrites host-element spreads in its virtual
// TSX as `__normalize_spread_props(...)` / `__normalize_spread_props_for_ref_attr(...)`
// (@tsrx/core's NORMALIZE_SPREAD_PROPS_INTERNAL_NAME). The octane platform
// descriptor declares no import source for those helpers, so without an
// ambient declaration every spread inside a directive block (`@switch`, `@if`)
// in the vendored .tsrx sources reports TS2304. Declared identity-typed so the
// spread checks against the author's original expression type. The runtime
// compile never emits these calls — this file is never loaded at runtime.
declare function __normalize_spread_props<T extends Record<PropertyKey, any> | null | undefined>(
	props: T,
): T;
declare function __normalize_spread_props_for_ref_attr<
	T extends Record<PropertyKey, any> | null | undefined,
>(props: T): T;
