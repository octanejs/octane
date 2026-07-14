# Live theme context

Implement `src/App.tsrx` as a small theme-settings view.

The module must continue to export `ThemeContext`, `ThemeLabel`, and `App`.

Requirements:

- `ThemeContext` has the default value `"system"`.
- `ThemeLabel` reads its nearest `ThemeContext` value and renders it in the
  `<output>` whose `id` is supplied by props.
- `App` starts with the outer theme `"light"` and has a button with the id
  `toggle-theme` that toggles the value between `"light"` and `"dark"`.
- Render the live outer value through `ThemeLabel` with the id `current-theme`.
- Render another `ThemeLabel` with the id `nested-preview` inside a nested
  provider whose value is always `"sepia"`.
- The `<main id="settings">` element has a `data-theme` attribute containing
  the live outer theme.
- A label's classes include `theme-label` and `theme-<value>`. Use Octane's
  native class composition rather than a third-party helper.

Do not edit the grader or add dependencies.
