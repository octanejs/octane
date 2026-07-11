---
'@octanejs/jotai': patch
---

New binding: jotai for octane. The framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useAtomCallback`, `useHydrateAtoms`, `useReducerAtom`) are ported onto octane hooks, preserving upstream's useReducer force-update implementation. Async atoms suspend through octane's `use()`. Differential-verified byte-identical against real jotai 2.20.1 on React.
