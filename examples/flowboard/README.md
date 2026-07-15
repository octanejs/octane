# Flowboard

Flowboard is a usable issue and project board built in TSRX. It exercises the real
modern `@octanejs/dnd-kit` binding against deterministic local data, with no live
network dependency in development or CI.

## Product journeys

- Browse a responsive four-column project board, search issues, filter priorities,
  and recover from an empty view.
- Move issues with dnd-kit using either the pointer or the keyboard handle’s
  Space, arrow, Space sequence. Each card also has a native keyboard move
  control whose cross-column moves deliberately restore focus.
- Open an issue as a deep-linkable `/issues/:id` route. The accessible modal is
  rendered into `#modal-root` with an Octane portal, uses the browser's modal top
  layer to contain focus and isolate the board, and returns focus to the
  originating issue when dismissed.
- Recover from a deterministic first-load failure via
  `/board?scenario=failure`, and continue making local board moves while the
  browser is offline.

The production Playwright suite covers five consumer journeys. It gates page
errors and unexpected console errors with the shared strict diagnostics helper,
and it checks public DOM identity for a keyed survivor during a drag. Identity is
observable here because losing that card would also lose its live focus and
control state.

## Octane evidence

- `DragDropProvider`, `useSortable`, `useDroppable`, and `DragOverlay` come from
  `@octanejs/dnd-kit`; no React compatibility layer is present.
- dnd-kit and the application share each card through an Octane multi-ref: the
  binding registers the sortable element while the application ref registry
  restores focus after a keyboard move. The native dialog also uses refs-as-props.
- Nested keyed TSRX loops keep unaffected issue cards alive while board state is
  reordered.
- The issue dialog proves native events and a portal stay connected to the same
  application state and route history.
- Loading, empty, error/retry, offline, canceled-drag, and successful movement
  states all have visible, accessible outcomes.

Flowboard is intentionally client rendered. It does not make an SSR or hydration
claim; those evidence targets belong to the examples whose manifests list those
rendering modes.

## Commands

From the repository root:

```bash
pnpm --dir examples/flowboard typecheck
pnpm --dir examples/flowboard build
pnpm --dir examples/flowboard test:e2e
```

`test:e2e` builds first and drives the production Vite preview. To point the suite
at an already-running server, set `FLOWBOARD_EXAMPLE_BASE_URL` to an absolute
HTTP(S) URL.
