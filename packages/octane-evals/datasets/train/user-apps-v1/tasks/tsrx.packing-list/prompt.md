# Build an interactive packing list

Create `src/App.tsrx` and export a component named `App`.

Build a packing list with these requirements:

- Start with one unpacked item named `Passport`.
- Provide a controlled text input labelled `Packing item` and an `Add item`
  submit button. Use native `onInput` and `onSubmit` events.
- Trim submitted labels, ignore blank submissions, clear the input after a
  successful addition, and assign every item a stable unique numeric ID.
- Display `N unpacked` in an element with the accessible name `Packing summary`.
- Render items with keyed TSRX `@for` and an `@empty` branch. Each row must:
  - display the item label;
  - have class `packed` only while packed;
  - offer a button named `Pack LABEL` or `Unpack LABEL`;
  - offer a button named `Remove LABEL`.
- When the list is empty, render the text `No items to pack`.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or
modify the grader.
