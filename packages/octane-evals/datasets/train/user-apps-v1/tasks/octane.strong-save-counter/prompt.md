# Repair a Strong-mode save counter

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:10:4: [OCTANE_STRONG_EFFECT_STATE_UPDATE] Strong mode does not allow synchronous state updates inside effect setup. startTransition, a useTransition start function, queueMicrotask, Promise.resolve().then, a zero-delay setTimeout, and awaiting a value that is not a pending promise all run before the next paint, so they count as setup too. Derive the value during render or use useLinkedState when state follows another value. Render from a DOM measurement with useLayoutSnapshot. See https://octanejs.dev/docs/strong-mode#octane-strong-effect-state-update
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which takes an async `save` prop and renders a `Save` button and a `Saved N times` message.
- Each click calls `save()` once. When that call resolves, the count goes up by one.
- Overlapping saves must each be counted.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
