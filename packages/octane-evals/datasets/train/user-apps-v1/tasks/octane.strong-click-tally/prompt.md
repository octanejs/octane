# Repair Strong-mode click tallies

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:14:17: [OCTANE_STRONG_RENDER_REF_READ] Strong mode does not allow reading useRef.current during render. Read the ref in an event or effect, or use state or useLinkedState for values that drive render output.
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which renders two tally buttons labelled `Apples: N` and `Pears: N`, each counting its own clicks from zero.
- Each tally is independent, and a newly mounted `App` starts both tallies at zero.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
