# Octane in React

A plain React app (real `react`/`react-dom`, `@vitejs/plugin-react`) adopting
Octane incrementally through
[`@octanejs/react-wrapper`](../../packages/react-wrapper):

- `wrapOctane(Counter)` — a compiled `.tsrx` component as a first-class React
  component; a React slider drives its `step` prop while its Octane `useState`
  survives every React commit.
- `<OctaneWrapper component={Card}>…</OctaneWrapper>` — React children (state,
  events and all) rendered inside the Octane component's `children` hole.
- A toggled Octane clock — unmounting from React runs Octane effect cleanups.
  The app runs under `StrictMode`.

The Vite config is the whole integration: React owns `.tsx`, Octane compiles
only `.tsrx` (`octane({ tsx: false })`).

```bash
pnpm --filter octane-in-react-example dev
```
