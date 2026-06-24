// The framework-agnostic core, re-exported verbatim from zustand. @octane-ts/zustand
// reuses zustand's vanilla store unchanged — only the React binding (see index.ts)
// is swapped for one built on octane's `useSyncExternalStore`. Authors who only
// need the store (no component binding) can import from `@octane-ts/zustand/vanilla`
// exactly as they would from `zustand/vanilla`.
export * from 'zustand/vanilla';
export { createStore as default } from 'zustand/vanilla';
