# React packages in Octane

An Octane app — **no React installed** — using unmodified React packages out of
the box through [`@octanejs/react-compat`](../../packages/react-compat):

- `jotai`: two React islands share one atom; the real package's store wiring
  keeps them in sync.
- `react-hook-form`: uncontrolled ref registration, `onChange` semantics, and
  error re-renders, straight from the npm build.
- The app's own islands are authored as plain React `.tsx` — the automatic JSX
  runtime and every `react` import resolve to the Octane facades.

The Vite config is the whole integration
(`octane({ tsx: false, compat: [react()] })`). At a `.tsrx` JSX site, a React
component crosses the boundary through `resolveCompatType`.

```bash
pnpm --filter react-in-octane-example dev
```
