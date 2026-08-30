# @octanejs/livestore

Octane bindings for [LiveStore](https://livestore.dev/), ported from
`@livestore/react@0.4.0` at commit
`c80acb39066b9472da426a35c81969df4919ae2d`.

The package reuses LiveStore's published framework-neutral store, schema,
query, registry, and framework-toolkit packages. It replaces only the React
context, Suspense, hook, and component layer with Octane equivalents.
The exact upstream source, tests, snapshots, package metadata, and license are
vendored byte-for-byte under `upstream/`; [UPSTREAM.md](./UPSTREAM.md) records
the export and test crosswalk.

```sh
npm install @octanejs/livestore @livestore/adapter-web
pnpm add @octanejs/livestore @livestore/adapter-web
```

```ts
import { StoreRegistry, storeOptions, useStore } from '@octanejs/livestore';
```

The stable root surface includes `StoreRegistryProvider`, `useStoreRegistry`,
`useStore`, `useQuery`, `useQueryRef`, `useClientDocument`, and
`useSyncStatus`. `LiveList` is available from both the root and
`@octanejs/livestore/experimental`, matching the pinned upstream release.

`ReactApi` and `withReactApi` retain their upstream names for source
compatibility, but attach Octane hooks and do not depend on React.

## Compatibility

- LiveStore dependencies are pinned to the coherent 0.4.0 release closure,
  which uses Effect 3.
- Query errors are labeled `@livestore/octane:useQuery`. The pinned
  framework-toolkit still uses an internal refresh-reason tag named `react`;
  this diagnostic-only upstream detail is intentionally not forked.
- React Strict Mode double invocation is not emulated.
- The upstream short-`unusedCacheTime` retain timing limitation remains:
  `useStore` retains in a passive effect after a successful render.

LiveStore is Apache-2.0 licensed. This adaptation preserves that license and
documents Octane-specific changes in this repository.

Maintainers can verify the pinned evidence with
`pnpm --dir packages/livestore upstream:verify`.
