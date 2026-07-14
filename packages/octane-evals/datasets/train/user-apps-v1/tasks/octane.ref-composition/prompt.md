# Compose refs through a reusable field component

Implement `src/App.tsrx` and continue to export `TextField` and `App`.

This task exercises Octane's ref model. Function components receive `ref` as a
normal prop, so `forwardRef` is neither available nor needed. A host element can
also receive an array of refs to attach every ref to the same node.

`TextField` receives these props:

```ts
{
	id: string;
	label: string;
	ref: unknown;
}
```

Requirements:

- `TextField` renders a labelled text input and forwards `props.ref` directly to
  that input's `ref` attribute.
- Do not import or implement a `forwardRef` wrapper.
- `App` receives an `inputRef` prop, creates its own object ref with `useRef`, and
  composes both refs by passing `ref={[props.inputRef, internalRef]}` to
  `TextField`.
- `App` renders the field with the label `Email` and a `Focus email` button.
- Clicking `Focus email` focuses the input through the internal object ref.
- The caller's object or callback ref must receive the same input and must be
  cleared when the field unmounts.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or edit
the grader.
