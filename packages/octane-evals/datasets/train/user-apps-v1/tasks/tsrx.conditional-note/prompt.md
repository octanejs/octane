# Build a conditionally enabled note editor

Create `src/App.tsrx` and export a component named `App` with these props:

```ts
{
  enabled: boolean;
  onSave: (note: string) => void;
}
```

Octane permits hooks after a conditional early return. Implement a plain
JavaScript early return while `enabled` is false, before calling the note
editor's `useState` hook. The hook may be skipped on disabled renders, and its
state must still be present when the editor is enabled again.

Requirements:

- The disabled branch renders `Notes are disabled` in an element with
  `role="status"` and does not render a textbox.
- The enabled branch renders a controlled textarea labelled `Note`, with a
  maximum length of 80, driven by the native `onInput` event.
- Render `N / 80` in an element with the accessible name `Character count`,
  counting the draft exactly as typed.
- Render a `Save note` button. Disable it for an empty or whitespace-only
  draft. Otherwise call `onSave` with the trimmed note.
- Preserve the draft when `enabled` changes from true to false and back to
  true without unmounting the component.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or
modify the grader.
