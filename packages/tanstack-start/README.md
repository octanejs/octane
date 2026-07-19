# @octanejs/tanstack-start

TanStack Start for Octane. This is the first-party facade the website (and
other Octane apps in this repo) consume: thin Node-native `.js` re-export
entries over `@tanstack/octane-start`, plus a vite-plugin wrapper that owns
the repo's dependency-optimizer integration fixes.

## History

TanStack's Octane flavor of Start was developed on
[TanStack/router#7847](https://github.com/TanStack/router/pull/7847). While
that PR was unmerged, this package vendored its seven PR-branch-only packages
in-repo (removing pkg.pr.new URL dependencies that broke `pnpm install` under
pnpm 11's `blockExoticSubdeps` whenever the workspace importer set changed) and
carried the native `StreamOptions.injection` stream path that was later
contributed back upstream. With the upstream packages published to npm, the
vendor tree is gone and everything resolves from the registry again.

## Usage

```ts
// vite.config.ts
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';
```

App code keeps the upstream module names (`createFileRoute` etc. from
`@tanstack/octane-router`, `createStart` types from `@tanstack/octane-start`)
— the start compiler and the generated `routeTree.gen.ts` key on those
specifiers.

## The plugin wrapper

`tanstackStart()` re-exports the upstream plugin with two additions for this
repo's setup (see `src/plugin-vite.js`):

- **optimizeDeps excludes** for the start runtime chain — prebundled dep
  chunks bypass the start compiler's per-environment stripping (a prebundle
  would execute `AsyncLocalStorage` in the browser).
- **optimizeDeps includes** for `@tanstack/octane-router`'s registry-dep
  subpaths — octane-router ships raw `.tsrx`/`.ts` source vite's scanner
  cannot parse, so request-time discovery would otherwise trigger a
  mid-session optimize reload that races hydration.
