---
'octane': patch
---

A reducer that reads only its state now gives `useReducer` a dispatch you can call with no argument, as React's types do: `const [, forceUpdate] = useReducer((n: number) => n + 1, 0); forceUpdate();`. This also lets that dispatch go where a `() => void` callback is expected.
