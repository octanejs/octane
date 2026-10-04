---
'octane': patch
---

A `function … @{ … }` component that is not a top-level declaration now has its hooks slotted once. This covers `memo(function X() @{ … })`, a `function F() @{ … }` declared inside a component or helper, one held in an object or array, and, on the server, one passed as a component prop. The compiler used to rewrite these bodies twice. When such a body destructured the third member of `useState`, `useReducer` or `useLinkedState`, the module failed to load with `SyntaxError: Identifier '_$__useStateWithGetter' has already been declared`, or the `useReducer`/`useLinkedState` equivalent. Bodies without a getter loaded, but their built-in hooks took a second, unused slot.
