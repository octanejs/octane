---
'octane': patch
---

Render more hookful components without a Block of their own in Strong production client builds. Besides `useState`, `useReducer`, `useRef`, `useEffect`, `useLayoutEffect`, `useContext` and `useId`, a component on the lightweight path may now call `useLazyRef`, `useInsertionEffect`, `useImperativeHandle`, `useLayoutSnapshot`, `useEffectEvent`, `useSyncExternalStore`, `useLinkedState`, `useTransition`, `useDeferredValue`, `useOptimistic`, `useActionState`, `useFormState` and `useFormStatus`. A component that calls `use()` keeps its Block.
