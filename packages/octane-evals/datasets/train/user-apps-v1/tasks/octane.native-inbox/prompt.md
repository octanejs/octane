# Handle nested native events in an inbox

Create `src/App.tsrx` as an interactive inbox. Keep these exports:

- the `Message` interface;
- the `MessageRow` component; and
- the `App` component.

`App` starts with these messages in order:

1. `Release notes`
2. `Deploy report`

Implement the following behavior:

- Compose one `MessageRow` per message with keyed TSRX `@for` and show
  `Inbox empty` through `@empty` after both are removed.
- A row is keyboard-focusable. Clicking it, or pressing Enter or Space while
  it has focus, selects that message.
- Render `Selected: TITLE` in an element with `role="status"`, or
  `No message selected` when there is no selection.
- Give each row a nested button named `Delete TITLE`. Its native `onClick`
  handler must call `stopPropagation()` on the real `MouseEvent` before
  deleting the message, so deleting an unselected message does not also select
  its parent row.
- If the selected message is deleted, clear the selection.
- Give the selected row the class `selected` and set `aria-current="true"`.

Use component-local `useState`, native `onClick`/`onKeyDown` handlers, and TSRX
`@if` for the status. Keep all implementation in `src/App.tsrx`; do not add
dependencies or modify the grader.
