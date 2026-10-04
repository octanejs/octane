# Repair a Strong-mode viewport width

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:4:16: [OCTANE_STRONG_RENDER_AMBIENT_READ] Strong mode does not allow reading browser globals during render. Use useSyncExternalStore with a server snapshot for live browser state, or read it in an effect or a lazy state initializer. Lazy initializers still need to handle server rendering. See https://octanejs.dev/docs/strong-mode#octane-strong-render-ambient-read
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which renders `Width: <n>px` for the current `window.innerWidth` and updates on window `resize` events.
- During server rendering, report a width of `1024` without reading browser globals.
- Release every listener, timer, or subscription when the component unmounts.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
