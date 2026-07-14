# Build a bounded seat counter

Create `src/App.tsrx` and export a component named `App`.

Build a small seat selector with these requirements:

- Start with zero selected seats.
- Render an `Add seat` button, a `Remove seat` button, and an `<output>` with
  the accessible name `Seat count`.
- Use Octane `useState` and native `onClick` handlers.
- Keep the count between zero and three. Disable `Remove seat` at zero and
  `Add seat` at three.
- Render one live status message using TSRX `@if` control flow:
  - `No seats selected` at zero.
  - `Ready to reserve` at one or two.
  - `Selection full` at three.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or
modify the grader.
