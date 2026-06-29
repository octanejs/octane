---
"octane": patch
---

Three hook fixes:

- **`useDeferredValue`** now compares with `Object.is` instead of `===`/`!==`. `NaN` no
  longer schedules a deferred re-render every tick (it used to never settle), and a
  `-0`/`+0` change is now detected.
- **`useImperativeHandle`** now re-attaches when the `ref` identity changes even if `deps`
  are stable (e.g. `[]`). A swapped ref previously left the old ref populated and the new
  ref unset; now the old ref is cleared and the new one is populated.
- **`useCallback(fn)`** with no deps inside a custom hook is no longer brittle. It used to
  pre-resolve the slot and forward it to `useMemo`, which (in a custom-hook path context)
  defeated `useMemo`'s own omitted-deps reinterpret and let the trailing slot Symbol be
  treated as a deps array — caching a stale callback. It now reinterprets the omitted-deps
  form itself and forwards the raw slot so `useMemo` resolves it exactly once.
