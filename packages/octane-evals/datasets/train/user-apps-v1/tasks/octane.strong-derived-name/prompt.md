# Repair a Strong-mode derived name

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:8:3: [OCTANE_STRONG_EFFECT_STATE_UPDATE] Strong mode does not allow synchronous state updates inside effect setup. startTransition, a useTransition start function, queueMicrotask, Promise.resolve().then, a zero-delay setTimeout, and awaiting a value that is not a pending promise all run before the next paint, so they count as setup too. Derive the value during render or use useLinkedState when state follows another value. Render from a DOM measurement with useLayoutSnapshot. See https://octanejs.dev/docs/strong-mode#octane-strong-effect-state-update
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which takes `first` and `last` props and renders `Signed in as <first> <last>` in a `<p>`.
- Server-rendered HTML must already contain the full name.
- When the props change, the new name appears in the same render.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
