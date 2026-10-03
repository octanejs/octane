# Repair a Strong-mode label width

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:9:3: [OCTANE_STRONG_EFFECT_STATE_UPDATE] Strong mode does not allow synchronous state updates inside effect setup. This effect copies a DOM measurement into state. Render from the measurement with useLayoutSnapshot(() => measure(), { initial }) instead: it measures after layout and re-renders before paint only when the value changes. See https://octanejs.dev/docs/strong-mode#octane-strong-effect-state-update
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which takes a `text` prop and renders a `<figure>` containing the text in a `<span>` and a `<figcaption>` reading `<n>px wide`, where `<n>` is the span's `offsetWidth`.
- The first frame the browser paints must already show the measured width, and the caption must follow changes to `text`.
- The server cannot measure, so server-rendered HTML reads `0px wide`.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
