# Draftboard

Draftboard is a usable, deterministic SVG product whiteboard built entirely with Octane TSRX. The `/boards/launch` deep link opens a seeded launch narrative; `/boards/empty` opens a durable blank canvas.

The example deliberately exercises browser-heavy framework boundaries:

- native pointer capture across high-frequency drag, draw, and pan gestures;
- keyed SVG objects whose identity survives selection and document updates;
- multi-selection, roving keyboard object focus, keyboard nudge/delete, and bounded undo/redo history;
- a refs-as-props canvas API exposed with `useImperativeHandle` for focus, zoom, and fit-selection controls;
- portaled keyboard help with inert background content, contained focus, and focus restoration;
- validated local documents plus per-board pending drafts that survive navigation during debounce, deterministic load/save failures, explicit retry, offline queueing, and reconnect convergence.

## Run it

From the repository root:

```bash
pnpm --dir examples/draftboard dev
pnpm --dir examples/draftboard typecheck
pnpm --dir examples/draftboard build
pnpm --dir examples/draftboard test:e2e
```

The five Playwright journeys run against a real Chromium browser and assert rendered output, focus, URL state, SVG coordinates, survivor DOM identity, persisted documents, and browser diagnostics. Failure fixtures are selected with `?scenario=load-failure,save-failure`; no external service or nondeterministic data is required.
