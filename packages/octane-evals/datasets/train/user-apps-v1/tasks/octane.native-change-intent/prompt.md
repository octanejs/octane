# Distinguish native text edits from commits

Implement `src/App.tsrx` and continue to export `PreferenceField` and `App`.

This task exercises Octane's native event contract. On a native text-entry host,
`onInput` observes every edit while `onChange` observes the browser's later
commit (normally blur). Octane does not remap `onChange` to a synthetic input
event.

Build a settings form with these independently observable controls:

- A controlled text input labelled `Live title`. Update an output labelled
  `Live title value` on every edit with `onInput`.
- An uncontrolled text input labelled `Draft note`, initially
  `Initial draft`. Its output, labelled `Last saved draft`, initially reads
  `Nothing committed yet`; update that output only on native `change`. Mark this
  deliberate commit handler with the host-level
  `suppressNativeChangeWarning` prop. Do not also add `onInput`, and do not make
  this input controlled.
- A controlled select labelled `Plan`, initially `Free`, with `Free` and `Pro`
  options. Update an output labelled `Selected plan` with its native
  `onChange`.
- A controlled checkbox labelled `Email alerts`, initially unchecked. Update an
  output labelled `Alert status` between `disabled` and `enabled` with its native
  `onChange`.
- `PreferenceField` receives an `onChange: (value: string) => void` component
  callback. It renders a `Choose compact` button that calls the callback with
  `compact`. Compose it from `App` without renaming that component prop, and
  report the value in an output labelled `Layout` (initially `comfortable`).
- A controlled text input labelled `Dynamic alias` receives `type`, `value`, and
  `onInput` through one spread prop bag. Compute the bag's `type` dynamically at
  runtime, update an output labelled `Dynamic alias value` on every edit, and do
  not produce a development diagnostic.

The `onInput`/`onChange` distinction applies only to native text-entry hosts;
selects, checkboxes, radios, and component callback props legitimately use
`onChange`. Capture-phase handlers follow the same distinction: use
`onInputCapture` for per-edit text behavior, or a suppressed `onChangeCapture`
for deliberate commit behavior.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or edit
the grader.
