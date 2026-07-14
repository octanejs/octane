# Report the latest scheduled state from long-lived callbacks

Implement `src/App.tsrx` and export a component named `App` with these props:

```ts
{
	onImmediate: (count: number) => void;
	schedule: (job: () => void) => void;
	onDeferred: (count: number) => void;
}
```

This task exercises Octane's third `useState` tuple member. The stable state
getter reads the latest scheduled hook-cell value, so callbacks do not need a
separately synchronized ref to avoid stale render closures.

Requirements:

- Start a count at zero and render it in an output labelled `Current count`.
- Destructure `useState` as `[count, setCount, getCount]`.
- An `Increment` button adds one with a functional state update.
- An `Increment twice` button schedules two functional increments in the same
  event, then calls `onImmediate(getCount())`. The observer must see the updated
  value immediately.
- A `Report later` button calls `schedule` with a job that invokes
  `onDeferred(getCount())` when the job eventually runs.
- A job scheduled before later increments must report the newest count, not the
  render value captured when it was created.
- Do not mirror the state into a ref.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or edit
the grader.
