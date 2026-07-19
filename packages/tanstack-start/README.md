# @octanejs/tanstack-start

TanStack Start for Octane, vendored in-repo. This is the first-party binding the
website (and future Octane apps in this repo) consume instead of the pkg.pr.new
preview build of `@tanstack/octane-start`.

## What this package is

TanStack's own Octane flavor of Start lives on an unmerged TanStack/router PR
branch (commit `753f919e`) and was previously consumed as pkg.pr.new URL
dependencies. pnpm 11's `blockExoticSubdeps` protection re-fires whenever the
workspace importer set changes, so those URL deps made `pnpm install` fail as
soon as ANY new workspace package was added. This package removes the URL pins
while keeping the supply-chain protection enabled.

- `vendor/` holds the seven packages that exist **only** on that PR branch,
  copied verbatim (dist + src) and registered as private workspace packages
  under their upstream `@tanstack/*` names:
  `octane-router`, `octane-start`, `octane-start-client`,
  `octane-start-server`, `router-generator`, `router-plugin`,
  `start-plugin-core`. The upstream names are load-bearing: the start compiler
  matches import specifiers like `@tanstack/octane-start` and the route-tree
  generator emits `@tanstack/octane-router` / `@tanstack/octane-start` into
  `routeTree.gen.ts`.
- Their remaining `@tanstack/*` deps (`history`, `router-core`, `router-utils`,
  `virtual-file-routes`, `start-client-core`, `start-server-core`,
  `start-storage-context`, `start-fn-stubs`) were verified byte-identical to the
  same-numbered npm releases and resolve from the registry.
- The top-level `src/` entries are thin Node-native `.js` re-exports (plus
  `.d.ts` companions) so `vite.config.ts` can import the plugin without a build
  step, mirroring `@octanejs/mdx`'s vite entry convention.

## Usage

```ts
// vite.config.ts
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';
```

App code keeps the upstream module names (`createFileRoute` etc. from
`@tanstack/octane-router`, `createStart` types from `@tanstack/octane-start`) —
both resolve to the vendored workspace packages.

## Maintenance

Do not hand-edit `vendor/` beyond the package.json dependency rewrites
(URL → `workspace:*` / exact registry versions, `octane` peer → `workspace:*`),
with ONE deliberate exception:
`vendor/octane-router/src/ssr/renderRouterToStream.ts` was rewritten onto
octane's native `StreamOptions.injection` API (replacing the
`transformStreamWithRouter` byte-level merge and its doctype/style wrapper
transforms). That file is kept **byte-identical** to the patch prepared for
the upstream PR (TanStack/router#7847), committed here as
[`tanstack-octane-native-injection.patch`](./tanstack-octane-native-injection.patch)
so vendor-vs-upstream diffs stay clean and the claim is verifiable
(`git apply --check` on a checkout of the PR branch); once upstream applies
it, the file is verbatim again.
To update, re-vendor from a newer upstream build and re-apply those rewrites.
Once the upstream PR lands and `@tanstack/octane-*` publish to npm, `vendor/`
can be deleted and this facade repointed at registry dependencies.
