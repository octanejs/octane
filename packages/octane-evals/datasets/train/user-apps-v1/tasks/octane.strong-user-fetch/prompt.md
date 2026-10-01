# Repair a Strong-mode user loader

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:11:20: [OCTANE_STRONG_EFFECT_DATA_FETCH] Strong mode does not allow fetching data into state from an effect without cleanup. Read data with use() or a query binding; keep effects for external synchronization with cleanup.
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which takes a `userId` prop and loads `/api/users/<userId>` with `fetch`. The response JSON has a `name`.
- Show `Loading…` until the first user arrives, then the user's name in a `<p>`.
- When `userId` changes, never show an older user's response that arrives after the newer one.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
