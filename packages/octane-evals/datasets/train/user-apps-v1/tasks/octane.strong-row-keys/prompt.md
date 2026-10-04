# Repair Strong-mode task row keys

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:20:35: [OCTANE_STRONG_RENDER_IMPURE_CALL] Strong mode does not allow a key computed from time or randomness during render; the element would get a new identity every render. Use a stable ID from the item, such as `item.id`. See https://octanejs.dev/docs/strong-mode#octane-strong-render-impure-call
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which lists tasks. Each row has a toggle button, labelled with the task title, that shows `Details for <title>` below it.
- `Add task` inserts `New task N` at the top of the list, collapsed.
- A row stays open or closed with its task when other rows are added.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
