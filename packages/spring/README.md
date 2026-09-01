# @octanejs/spring

[React Spring](https://www.react-spring.dev/) for the
[Octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/spring
pnpm add @octanejs/spring
```

The package exposes the stable `@react-spring/web@10.1.2` surface at its root
and Parallax from `@octanejs/spring/parallax`. It reuses React Spring's
`rafz` scheduler and ports the framework-bound controller, hook, animated-host,
observer, and component layers to Octane without a React runtime dependency.

```tsx
import { animated, useSpring } from '@octanejs/spring';

export function Card(props) @{
  const [styles, api] = useSpring(
    () => ({
      from: { opacity: 0, y: 16 },
      to: { opacity: 1, y: 0 },
    }),
    [],
  );

  <animated.div style={styles} onClick={() => api.start({ to: { y: 8 } })}>
    {props.children}
  </animated.div>
}
```

## Upstream

The behavioral and type baseline is React Spring `v10.1.2` at commit
`59b1e5306402d3039120e2da464b66e10b1a1aa1`. Adapted source provenance is
recorded in [`UPSTREAM.md`](./UPSTREAM.md).

## Status

Supported scope, divergences, and verification are recorded in
[`status.json`](./status.json) and the generated repository compatibility
tables.

## Verification

```sh
pnpm --dir packages/spring upstream:verify
pnpm --dir packages/spring typecheck
pnpm exec vitest run --project spring --project spring-ssr
pnpm exec vitest run --project spring-browser
pnpm packages:pack:check
```

The browser lane builds and exercises the central playground in development
and production. The repository packed-source canary installs the root and
Parallax subpath from their tarball alongside a packed Octane runtime.
