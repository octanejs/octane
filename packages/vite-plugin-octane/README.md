# `@octanejs/vite-plugin`

Vite integration for Octane: `.tsrx` and eligible `.tsx` compilation for a
client-only SPA, plus optional routing, streaming SSR, hydration, production
client/server builds, and preview when an `octane.config.ts` declares routes.

## Install

```sh
pnpm add octane @octanejs/vite-plugin
pnpm add -D vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],
});
```

Without `octane.config.ts`, the plugin compiles Octane source and leaves Vite's
normal client-only SPA behavior intact, including its `import.meta.hot` HMR
dialect. Add an Octane config with routes to activate the full app layer. See
the [build tools guide](https://octanejs.dev/docs/build-tools) for the app
layer, adapters, and options.

## Scoped CSS

Scoped `<style>` blocks compile to `injectStyle(hash, css)` calls — one per
style scope, in lexical order — emitted as module-level statements on the
client and inside the component body per request on the server, where the
render collects them into the response's `<style data-octane>` tags. A theme
(`export const theme = <style>…</style>`) is an ordinary module value, so
importing it injects its sheet ahead of the importer's own scopes. There is no
virtual CSS module and no CSS HMR path: editing a block re-evaluates the module
like any other source change. The plugin needs no CSS loader or extra
configuration for this.
