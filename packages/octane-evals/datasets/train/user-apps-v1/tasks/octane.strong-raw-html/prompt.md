# Repair Strong-mode trusted release notes

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:9:3: [OCTANE_STRONG_RAW_HTML_WRITE] Strong mode does not allow `innerHTML` on the <article> that Octane renders. Use `dangerouslySetInnerHTML={trustHTML(html)}` on it; trustHTML() marks trusted or already sanitized HTML and does not sanitize it.
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which takes an `html` prop. The release pipeline sanitizes that HTML, so it is safe to render.
- Render the markup inside `<article class="release-notes">`, including in server-rendered HTML.
- When `html` changes, replace the rendered markup.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
