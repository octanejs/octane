# Repair a Strong-mode draft history

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:36:6: [OCTANE_STRONG_RENDER_REF_READ] Strong mode does not allow initializing history.current during render. Use useLazyRef(() => value) in place of useRef: it creates the value once, when the ref's hook cell is created. See https://octanejs.dev/docs/strong-mode#octane-strong-render-ref-read
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which renders a draft `<textarea>` and an `Undo` button. Each edit records the previous draft, `Undo` restores it, and `Undo` is disabled when there is nothing to undo, including in server-rendered HTML.
- `App` takes an optional `createHistory` prop, which defaults to `() => new UndoStack()` and returns an object with `size`, `push(text)`, and `pop()`. Building a history is expensive: call `createHistory` at most once per mounted editor, even when a re-rendering parent passes a new function.
- Every mounted editor has its own history, and a newly mounted editor starts with an empty one.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
