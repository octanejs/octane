# Grab Playground

1:1 Octane port of upstream `apps/e2e-app-vite` (react-grab@0.2.0 /
`23bce0e56f2808902f1126ad581f6d8c3b5f639e`) for validating `@octanejs/grab`.

## Run

```bash
pnpm --filter grab-playground-example dev
```

Open http://localhost:5299 — add `?activate=1` to start the overlay immediately.

## How grab works (same as upstream)

1. **Hold ⌘ / Ctrl** briefly (~100ms+) to activate the overlay (or use the toolbar).
2. **Hover** a target (e.g. `data-testid="grab-smoke-target"`).
3. **⌘C / Ctrl+C** to copy element + owner context.

`window.initReactGrab` / `window.initOctaneGrab` match the upstream e2e window surface.

## Stubs

These upstream fixtures are stubbed (React-only / blocked binding paths):
PerfGrid, HeavyPage, Pierre, Shadow DOM edge, R3F, Three.js, Iframe host.
