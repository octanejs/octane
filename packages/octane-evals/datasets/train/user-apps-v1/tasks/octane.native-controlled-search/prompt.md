# Build a controlled search field with native input events

Implement `src/App.tsrx` and continue to export `SearchField` and `App`.

This task exercises an intentional Octane difference from React: text controls
use the browser's native `input` event. There is no synthetic `onChange`
normalization.

`SearchField` receives these props:

```ts
{
	id: string;
	value: string;
	onQueryInput: (value: string, event: Event) => void;
}
```

Requirements:

- Render a search input labelled `Search` using the supplied `id`.
- Make the input controlled by the `value` prop.
- Handle each edit with `onInput`, not `onChange`. Call `onQueryInput` with the
  input's live string value and the native `Event` object.
- If a parent does not accept an edit by supplying a new `value`, the controlled
  input must return to the supplied value after the event.
- `App` receives an `onQueryInput` prop with the same callback signature. It owns
  an initially empty query with `useState` and composes `SearchField`.
- `App` renders `Type to search` in a status element while empty and
  `Searching for: <query>` after edits.
- Render a `Clear search` button. It is disabled while empty and clears the
  controlled query when clicked.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or edit
the grader.
