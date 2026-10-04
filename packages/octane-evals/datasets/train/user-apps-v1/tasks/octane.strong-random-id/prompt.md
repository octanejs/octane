# Repair Strong-mode form field IDs

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:6:22: [OCTANE_STRONG_RENDER_IMPURE_CALL] Strong mode does not allow generating random IDs or bytes during render. Use useId() for element IDs; create other random values in an event handler and store them in state. See https://octanejs.dev/docs/strong-mode#octane-strong-render-impure-call
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which renders an email input with a label linked by `for`/`id`, and a message that echoes the typed address.
- Server rendering the form twice must produce identical HTML.
- The input ID must not change while the user types, and two forms on the page must have different IDs.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
