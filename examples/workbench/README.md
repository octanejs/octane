# Workbench

A Tauri v2 desktop task runner built with Octane and
[`@octanejs/tauri`](../../packages/tauri). It lists tasks over IPC, reads a
task manifest, runs one, and streams its log back from the backend.

## What it holds down

- **`useInvoke`** loads the task index and suspends into `@try` / `@pending` /
  `@catch (error, reset)`. A rejected command reaches the catch block, and
  resetting the boundary re-runs it through an explicit `deps` key.
- **`useInvokeState`** reads the selected task's manifest without suspending, so
  the detail pane owns its own pending, error, and refetch affordances.
- **`useTauriEvent`** subscribes to `workbench:log`. The "Stop watching log"
  toggle detaches the listener mid-run, which is the observable proof that the
  subscription is really torn down: the remaining lines, including the
  completion line, never arrive.

## Running it

```bash
pnpm dev            # frontend only, in a browser
pnpm tauri dev      # the real desktop app (needs a Rust toolchain)
pnpm test:e2e       # production build + Playwright journeys
```

Both halves answer the same three commands (`list_tasks`, `describe_task`,
`run_task`) and emit the same `workbench:log` event.

- `src-tauri/src/lib.rs` is the real backend, used by `pnpm tauri dev`.
- `src/bridge.ts` installs Tauri's own mock IPC when `__TAURI_INTERNALS__` is
  absent, so the dev server, `vite preview`, and every committed journey run in
  an ordinary browser with no Rust toolchain. Its fixtures and 150ms line
  cadence mirror the Rust side.

The header badge says which of the two answered.

## Fault scenarios

| URL | Behavior |
| --- | --- |
| `/?fault=list` | The first `list_tasks` rejects; the `@catch` fallback offers a retry that reloads the index. |
| `/?fault=describe` | The first `describe_task` rejects; the detail pane shows the error and recovers through `refetch()`. |

## Notes

`src-tauri/Cargo.lock` is not committed: CI never builds the Rust shell, and a
4k-line generated lockfile would churn in a JavaScript monorepo. Run
`pnpm tauri build` for a real bundle; `src-tauri/icons/icon.png` is a
placeholder, so replace it (or run `pnpm tauri icon`) before shipping anything.
