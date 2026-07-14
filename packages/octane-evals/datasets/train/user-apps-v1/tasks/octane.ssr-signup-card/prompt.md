# SSR-safe signup card

Implement `src/App.tsrx` as a signup card that can be server-rendered
and hydrated without replacing its DOM.

The module must continue to export `App`.

Requirements:

- `App` accepts `{ initialName: string }`.
- Generate the label/input association with Octane's `useId()`; do not hardcode
  an ID. Multiple roots must receive distinct IDs.
- Keep the name input controlled, initialized from `initialName`, and update it
  per keystroke using Octane's native `onInput` event.
- Render `Welcome, <trimmed name>` in `#greeting`, or `Welcome, guest` when the
  trimmed value is empty.
- A button with id `submit-count` increments a local counter. Its text starts at
  `Submitted: 0`.
- The server and client must produce the same ID when given the same
  `identifierPrefix`, so hydration adopts the existing label, input, heading,
  and button nodes.

Do not edit the grader or add dependencies.
