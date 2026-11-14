/** What the data-binding benchmark runs, shared by the page and the runner. */
export const ROWS = 5000;
/** The row that a write to one record changes. */
export const WRITTEN = 17;
export const RENDERERS = ['octane', 'react'];
/**
 * How a row reads:
 * - `hooks`: `useRead(useDataStore().read(...))`, the shipped binding, as documented;
 * - `handle`: `useRead(handle)` with handles made once, outside render, so the
 *   difference from `hooks` is what `store.read(...)` costs per render;
 * - `signals`: Octane only, the store read reported as a native signal read (#2410);
 * - `bare`: `useSyncExternalStore` over a trivial store holding the same values.
 */
export const LANES = {
	octane: ['hooks', 'handle', 'signals', 'bare'],
	react: ['hooks', 'handle', 'bare'],
};
/** `own`: each row reads its own record. `shared`: every row reads one list. `none`: rows read no data. */
export const SCENARIOS = ['own', 'shared', 'none'];
export const STEPS = ['mount', 'rerender', 'write', 'unmount'];
