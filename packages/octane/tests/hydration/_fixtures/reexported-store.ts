// Octane's hook reached through another module, as a binding that re-exports it
// provides it. The compiler calls such an import as a custom hook, through
// withSlot, so no trailing slot follows the authored arguments.
export { useSyncExternalStore } from 'octane';
