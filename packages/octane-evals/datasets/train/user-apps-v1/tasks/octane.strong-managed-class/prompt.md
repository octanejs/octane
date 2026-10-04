# Repair Strong-mode tab selection classes

`src/App.tsrx` opts into Octane Strong mode with `"use strong"`, and the
compiler rejects it:

```text
src/App.tsrx:16:3: [OCTANE_STRONG_MANAGED_DOM_WRITE] Strong mode does not allow `classList.toggle` on the <button> whose class the template sets. Compute the class in the template from state or props, for example `class={['base', active && 'active']}`. Keep refs for reading, focus, measurement, and DOM the template does not render. See https://octanejs.dev/docs/strong-mode#octane-strong-managed-dom-write
```

Fix the component so it compiles in Strong mode and meets these requirements:

- Export `App`, which renders `Overview`, `Activity`, and `Settings` tab buttons with the class `tab`.
- The selected tab also has the class `selected`, including in server-rendered HTML. `Overview` starts selected.
- Clicking a tab selects it and removes `selected` from the others.

Keep `"use strong"` at the top of the file and all code in `src/App.tsrx`. Do
not add dependencies or modify the grader.
