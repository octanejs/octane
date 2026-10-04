# Repair Strong-mode sorted tags

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:7:2: [OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION] Strong mode does not allow mutating a state snapshot during render. Derive a local copy, or pass a new value to the state updater from an event. See https://octanejs.dev/docs/strong-mode#octane-strong-render-snapshot-mutation
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which lists tags alphabetically. It starts with `octane` and `react`.
- An input labelled `New tag` and an `Add tag` button add the typed tag. Keep the typed text in the input after adding.
- The list shows every added tag in alphabetical order immediately.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
