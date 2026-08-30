# `@octanejs/inertia`

Inertia.js 3 bindings for Octane.

## Installation

```sh
npm install @octanejs/inertia
pnpm add @octanejs/inertia
```

The package reuses `@inertiajs/core` unchanged and ports the renderer-specific
`@inertiajs/react` adapter to Octane. It does not install or emulate React.

The initial port is pinned to `@inertiajs/react@3.6.1` and the Inertia 3.x
source tree at commit `68b13b662d7a6ecdd504026ee18733192b0c7d73`.
The exact React adapter source is retained in `upstream/` so each ported module
and future version update can be reviewed against its immutable baseline.

## Upstream ledger

| Contract | Upstream source | Octane entry |
| --- | --- | --- |
| Router singleton | `packages/react/src/index.ts` | `src/index.ts` |
| HTTP singleton | `packages/react/src/index.ts` | `src/index.ts` |
| Progress singleton | `packages/react/src/index.ts` | `src/index.ts` |
| Server helper | `packages/react/src/server.ts` | `src/server.ts` |

These exports preserve object identity with `@inertiajs/core@3.6.1`.
Renderer-owned exports from `packages/react/src/index.ts` are intentionally
absent from this foundation unit and are added with their corresponding
behavioral tests. React, ReactDOM, StrictMode, `forwardRef`, and synthetic event
types are explicit exclusions from the Octane package.

## Status

The framework-neutral exports, package boundary, contexts, layout-property
store, and renderer-independent hook/form layer are present. Components, root
lifecycle, full SSR/hydration, and the protocol playground are implemented by
the dependent units in the binding plan.
