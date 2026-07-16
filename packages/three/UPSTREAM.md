# Upstream React Three Fiber audit

This port targets the immutable React Three Fiber release `v9.6.1`:

- repository: `https://github.com/pmndrs/react-three-fiber`;
- tag commit: `2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7`;
- package: `@react-three/fiber@9.6.1`;
- exact Three behavior and type oracle: `three@0.172.0` and
  `@types/three@0.172.0`.

The upstream package accepts `three >=0.156`, but this port initially supports
only the pinned r172 lane. The broader peer range is gated on a real
minimum-version validation lane.

## Source boundary

The package adapts the R3F web/core behavior rather than its React renderer
shell:

- `packages/fiber/src/three-types.ts` informs renderer-local intrinsic and math
  shorthand types;
- `packages/fiber/src/core/reconciler.tsx` informs catalogue, reconstruction,
  ordering, attachment, disposal, and interaction-transfer behavior;
- `packages/fiber/src/core/utils.tsx` informs Three prop resolution and
  application;
- `packages/fiber/src/core/store.ts`, `renderer.tsx`, `loop.ts`, `events.ts`, and
  `hooks.tsx` inform their corresponding package-owned subsystems;
- `packages/fiber/src/web/Canvas.tsx` informs the DOM shell while Octane's
  declared renderer boundary replaces R3F's second React root and context
  bridge.

React Reconciler, ReactDOM, `scheduler`, `its-fine`, `react-use-measure`,
`use-sync-external-store`, and `suspend-react` are not runtime dependencies of
the port. React and R3F are development-only differential oracles.

The case-level export/test crosswalk must classify upstream behavior as
behavioral, differential, browser-only, type/package evidence, or not
applicable. It is release evidence, not permission to copy Fiber ownership
internals into Octane.

## License provenance

React Three Fiber is MIT-licensed, Copyright 2019–2025 Poimandres. Adapted
algorithms and types retain that notice in [`LICENSE`](./LICENSE). Three is a
peer dependency under its own MIT license; no Three source is vendored here.
