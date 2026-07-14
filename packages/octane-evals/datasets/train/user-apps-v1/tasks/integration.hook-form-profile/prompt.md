# Build a validated profile form

Implement `App` in `src/App.tsrx` with `@octanejs/hook-form`.

`App` receives an `onSave(profile)` callback. Render labelled `Name` and
`Email` fields and a `Save profile` submit button. Both fields are required,
and Email must have a basic `name@domain.tld` shape. Validate on each
keystroke, render the exact messages `Name is required`, `Email is required`,
and `Enter a valid email` with `role="alert"`, and never call `onSave` for an
invalid submission. A valid submission calls `onSave` exactly once with
`{ name, email }`.

Octane uses native delegated events. Spread the registration object returned by
the binding onto each input so its native `onInput` handler is used; do not add
React synthetic-event normalization. Only edit `src/App.tsrx`.
