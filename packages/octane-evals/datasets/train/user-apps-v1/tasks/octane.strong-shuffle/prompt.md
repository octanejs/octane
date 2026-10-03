# Repair a Strong-mode answer shuffle

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:9:39: [OCTANE_STRONG_RENDER_IMPURE_CALL] Strong mode does not allow nondeterministic calls during render. Read time or randomness outside render and pass the result as a prop or state snapshot. See https://octanejs.dev/docs/strong-mode#octane-strong-render-impure-call
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which lists the answers `Red`, `Green`, `Blue`, and `Yellow` as buttons, initially in that order, including in server-rendered HTML.
- Clicking an answer marks it with `aria-pressed="true"` and must not reorder the list.
- The `Shuffle` button shows the answers in a new random order, which then stays put until the next shuffle.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
