# Repair a Strong-mode profile heading

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:9:3: [OCTANE_STRONG_MANAGED_DOM_WRITE] Strong mode does not allow `textContent` on the <h1> whose children the template renders; Octane owns that child list. Render the content as its children from state or props. Keep refs for reading, focus, measurement, and DOM the template does not render. See https://octanejs.dev/docs/strong-mode#octane-strong-managed-dom-write
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which takes an optional `name` prop (default `Ada Lovelace`).
- Render the name in upper case inside the `<h1>`, including in server-rendered
  HTML.
- Render a button labelled `Follow (N)` that counts clicks from zero.
- When `name` changes, show the new name in upper case without resetting the
  follow count.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
