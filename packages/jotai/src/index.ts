// @octanejs/jotai — jotai for the octane renderer.
//
// jotai cleanly separates a framework-agnostic vanilla core (`atom`,
// `createStore`, `getDefaultStore` + all of vanilla/utils) from a small React
// binding (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`).
// This package reuses the vanilla core UNCHANGED (re-exported verbatim from
// `jotai/vanilla`) and reimplements only the binding on octane's hooks —
// preserving upstream's useReducer-force-update implementation rather than
// rewriting it on useSyncExternalStore, so re-render behavior matches jotai on
// React. The public surface matches jotai 1:1: existing jotai code works by
// changing the import from `jotai` to `@octanejs/jotai`.
//
// The one octane-specific detail is hook slots: octane keys hooks by a
// compiler-injected per-call-site Symbol, appended as the LAST argument of
// every `use*` call. The hooks here FORWARD that slot (deriving stable
// sub-slots when one hook composes several base hooks — see internal.ts), so
// `useAtom(a)` and `useAtom(b)` in one component stay independent, just like
// in React.
export * from './vanilla';
export * from './react';
