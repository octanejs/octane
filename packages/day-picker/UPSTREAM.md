# Upstream provenance

- Repository: <https://github.com/gpbl/react-day-picker>
- Version/tag: `10.0.1` / `v10.0.1`
- Commit: `6d3929d655779d178638d8f80171597a579468e8`
- License: MIT
- Upstream package root: `packages/react-day-picker`

The Octane implementation preserves the root, locale, stylesheet, and package metadata entry points. React-specific hooks and JSX components are adapted to Octane; framework-neutral date calculations and formatters retain their upstream behavior.

## Parity status: incomplete

This port is **explicitly incomplete** for React-parity evidence. Upstream ships both runtime and type suites under `upstream/src/**/*.test.*`, and the manifest records those suites as `present`, but this package does **not** yet execute them as parity lanes.

Still missing before this binding can claim a parity suite:

- pristine runtime lane that runs the unchanged pinned upstream suite with case/assertion negative controls
- adapted one-for-one upstream runtime inventory for the pinned suite
- pristine type lane and one-for-one adapted type inventory with accept/reject negative controls
- exhaustive upstream-test disposition for every vendored test artifact

Until those land, do not treat unpaired smoke inventories as a substitute for the upstream suite. The only React-parity evidence on this package is the bounded differential Vitest project (`react-day-picker-differential`). Repo-authored DOM, SSR, and browser smoke projects stay under ordinary ownership outside `adaptedRuntimeSummary`. Provenance verification remains `recorded-unverified`.
