# Electron Shell

An Electron desktop task runner built with Octane and
[`@octanejs/electron`](../../packages/electron). It lists tasks over IPC, reads a
task manifest, runs one, and streams its log back from the host.

## What it holds down

- **`useInvoke`** loads the task index and suspends into `@try` / `@pending` /
  `@catch (error, reset)`.
- **`useInvokeState`** reads the selected task's manifest without suspending.
- **`useIpcEvent`** subscribes to `workbench:log`. Detaching mid-run proves the
  subscription is torn down: remaining lines never arrive.
- **`useNativeTheme` / `useWindowState`** and the `app` / `dialog` / `clipboard` /
  `shell` / `windowControls` helpers — the Host panel exercises the same renderer
  desktop surface a React Electron app would use under contextIsolation.
- **Main-only APIs** — the Electron shell builds an application `Menu` from
  `@octanejs/electron/main/native` (intentional main-process surface).

## Running it

```bash
pnpm dev                 # frontend only, in a browser (mock bridge)
pnpm build && pnpm electron   # real Electron window (needs Electron binary)
ELECTRON_START_URL=http://127.0.0.1:5232 pnpm electron  # against vite dev
pnpm test:e2e            # production build + Playwright journeys
```

Browser preview and CI journeys install `installElectronBridge` when
`window.__OCTANE_ELECTRON__` is absent, so no Electron binary is required for
the committed suite. The header badge reports which host answered.

## Fault scenarios

| URL | Behavior |
| --- | --- |
| `/?fault=list` | The first `list_tasks` rejects; `@catch` offers a retry. |
| `/?fault=describe` | The first `describe_task` rejects; detail recovers via `refetch()`. |
| `/?fault=run` | The first `run_task` rejects; the run panel stays Idle with an alert. |
