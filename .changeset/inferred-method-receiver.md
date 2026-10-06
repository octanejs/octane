---
'octane': patch
---

Re-run an inferred hook when the receiver of a one-level method call changes, even if the method is one own function shared by several objects. `useEffect(() => source.subscribe())` now moves its subscription to a new `source` that shares `subscribe`, and a memo calling `source.read()` recomputes. An own arrow function still tracks only itself, because it cannot read `this`, so `props.onChange(...)` with a stable arrow callback stays quiet when the props container is rebuilt. Any other own function, including `vi.fn()` mocks, now tracks its receiver, as React Compiler does for every method call.
