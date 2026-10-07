# Repair Strong-mode post dates

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:14:7: [OCTANE_STRONG_RENDER_LOCALE_FORMAT] Strong mode does not allow `toLocaleDateString()` without an explicit locale and time zone during render; the server and the browser can format the same date differently and break hydration. Pass both, for example `toLocaleDateString('en-US', { timeZone: 'UTC' })`, or format in an event or effect and render the stored text. See https://octanejs.dev/docs/strong-mode#octane-strong-render-locale-format
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which lists each post title with its publication date in a `<time>` element.
- Every date string must include the year, and the rendered text must not depend on the server's or browser's time zone or locale.
- Server-rendered HTML and client-rendered text must match.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
