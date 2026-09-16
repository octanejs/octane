// Wire names shared by SSR and pre-root capture without loading DOM tables.
/** Inert compiler/bundler manifest for one independently activatable boundary. */
export const INDEPENDENT_HYDRATE_MANIFEST_ATTR = 'data-octane-independent';
export const HYDRATE_INDEPENDENT_ATTR = 'data-octane-hydrate-independent';
/** Compiler-owned stable key for a native control that can receive input before activation. */
export const HYDRATE_INPUT_ATTR = 'data-octane-input';
/** Server-only writable-signal identity joined to a compiler control site. */
export const SIGNAL_CONTROL_ATTR = 'data-octane-signal-control';
