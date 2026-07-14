# Build a reducer-driven account wizard

Create `src/App.tsrx` as a three-step account wizard. Keep these exports:

- the `Plan`, `WizardState`, `WizardAction`, and `Confirmation` types;
- the `wizardReducer` function;
- the `ProfileStep`, `PlanStep`, and `ReviewStep` components; and
- the `App` component.

`App` accepts this prop:

```ts
{
  onConfirm: (confirmation: Confirmation) => void;
}
```

Implement the following behavior:

- Own the complete wizard state with Octane `useReducer`. Start on the profile
  step with an empty name and the `starter` plan.
- Render the active step component with TSRX `@switch`.
- `ProfileStep` is a form containing a controlled input labelled `Name`.
  Update it with the native `onInput` event. Disable `Choose plan` while the
  name is empty or whitespace-only; otherwise submitting advances to the plan
  step.
- `PlanStep` is a form containing a controlled select labelled `Plan`, with
  `Starter` and `Pro` options. Update it with the native `onChange` event.
  Provide `Back` and `Review` controls.
- `ReviewStep` renders the trimmed name in an `<output>` named `Review name`
  and `Starter` or `Pro` in an `<output>` named `Review plan`. Provide `Back`
  and `Confirm` controls.
- Going backward and forward must retain the name and plan. Confirming calls
  `onConfirm` once with the trimmed name and selected plan.
- Every form submit handler must call `preventDefault()` on the real event.

Use child components and callbacks rather than putting all three views directly
inside `App`. Keep all code in `src/App.tsrx`; do not add dependencies or
modify the grader.
