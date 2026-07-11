// `@octanejs/jotai/react` — the binding layer, ported from jotai's react.ts.
// Upstream's implementation shape is kept deliberately (a force-update
// useReducer + effect subscription, NOT useSyncExternalStore) so behavior —
// including re-render timing and write-only non-re-rendering — matches jotai
// on React.
export { Provider } from './react/Provider.tsrx';
export { useStore } from './react/store';
export { useAtomValue } from './react/useAtomValue';
export { useSetAtom } from './react/useSetAtom';
export { useAtom } from './react/useAtom';
