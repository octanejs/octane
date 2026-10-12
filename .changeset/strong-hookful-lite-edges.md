---
'octane': patch
---

Render hookful components without a Block of their own in Strong production client builds. A same-module component, or a Vite import from another Strong module, whose only hooks are `useState`, `useReducer`, `useRef`, `useEffect`, `useLayoutEffect`, `useContext`, and `useId` now takes the lightweight component path. Its state, effects, refs, and context reads behave as before; its update re-renders the nearest component that owns a Block, which Strong render purity makes unobservable. Compatibility-mode modules keep a Block for every hookful component.
