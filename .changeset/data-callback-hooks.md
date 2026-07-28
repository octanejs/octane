---
'octane': patch
---

New compile option `dataCallbackHooks`. A hook can now declare that a callback
argument is data it memoizes on, rather than a dependency subject it re-runs.
Production compiles then key that callback on the values it actually reads, so
its identity moves only when they do.

```js
compile(source, filename, {
  dataCallbackHooks: ['@octanejs/tanstack-store#useSelector'],
})
```

Entries are `module#hookName`, matched against the call site's import — including
a namespace import, matched against the namespace's own module — or a bare
`hookName` for a hook declared in the module being compiled. A default or
namespace import from elsewhere never matches a bare entry.

This closes the other half of the capture-free callback lift. A callback that
captures nothing is lifted to module scope and keeps one identity forever; a
callback that reads component state cannot move, but is now wrapped in
`useCallback` with an inferred dependency list. On a 512-subscriber fan-out over
20 unrelated parent re-renders, selector invocations for a capturing selector
drop from 10,240 to zero, and the re-render cost fell from 21.4–23.1ms to
7.8–9.9ms.

The dependency list is left for inference to fill, which is why the transform
runs before it. That ordering is load-bearing rather than incidental: coarse
identifier dependencies (`[props]`) are worthless here, because the props object
is a fresh identity on every parent render, so the memo never hits. Inference
produces the member paths actually read (`[props.offset]`).

Nothing is inferred about which hooks qualify, and the transform is inert until
something opts in. The compiler already refuses to attach dependency semantics
to custom hooks it cannot statically prove, and a wrong answer here produces a
stale closure — silent, and attributed to the application rather than to the
compiler — so the fact is declared rather than guessed.

Declared hooks are still left alone where the hook owns freshness itself: when
its own dependency list is inferred, and when the call passes an explicit
dependency array or `null` (the author's "re-run every render" escape hatch).
Dev, HMR, and profile compiles keep the authored form, matching the neighbouring
inline hook-memo tier.
