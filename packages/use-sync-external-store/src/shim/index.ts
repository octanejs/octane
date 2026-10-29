// use-sync-external-store@1.7.0 `shim/index.js` and `shim/index.native.js`
// select React's built-in useSyncExternalStore whenever it exists, falling back
// to a userspace implementation only before React 18. Octane always has it.
export { useSyncExternalStore } from 'octane';
