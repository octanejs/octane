---
'@octanejs/aria': patch
---

New binding: `@octanejs/aria` — React Aria ported onto octane. Phase 0 ships the
utils foundation (`chain`, `mergeProps`, `mergeRefs`, `useId`/`mergeIds`,
`useObjectRef`, `RouterProvider`, `SSRProvider`/`useIsSSR`) and the complete
interactions area (`usePress`, `useHover`, `useFocus`, `useFocusWithin`,
`useFocusVisible`, `useKeyboard`, `useLongPress`, `useMove`,
`useInteractOutside`, `useFocusable`/`Focusable`, `Pressable`) on octane's
native delegated events, plus `useControlledState` under
`@octanejs/aria/stately`. Ported from the pinned react-aria 3.50.0 /
react-stately 3.48.0 sources and differential-verified byte-identical against
the real react-aria on React.
