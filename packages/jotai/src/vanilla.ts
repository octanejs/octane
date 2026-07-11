// The framework-agnostic core, re-exported verbatim from jotai. `atom`,
// `createStore`, and `getDefaultStore` are pure JS with no React import — only
// the React binding (see react.ts) is swapped for one built on octane's hooks.
// Authors who only need atoms + a store (no component binding) can import from
// `@octanejs/jotai/vanilla` exactly as they would from `jotai/vanilla`.
export * from 'jotai/vanilla';
