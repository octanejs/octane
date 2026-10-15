# @octanejs/tanstack-start

TanStack Start for Octane. This package owns the renderer integration needed
for file-route generation, route code splitting, server functions, streaming
SSR, hydration, and Vite or Rsbuild development and production builds.

It uses [`@octanejs/tanstack-router`](../tanstack-router) for the public router
binding and published renderer-neutral TanStack core packages for shared Start
and Router behavior. The Octane-specific generator, compiler, and Vite adapter
live inside this package, so installing it does not require private workspace
packages or preview release artifacts.

## Vite setup

```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';

export default defineConfig({
  plugins: [tanstackStart()],
});
```

The plugin installs Octane compilation before route analysis, generates TSRX
file routes with imports from `@octanejs/tanstack-router`, compiles Start's
environment-specific APIs, and configures the client and SSR Vite environments.

## Rsbuild setup

```ts
import { defineConfig } from '@rsbuild/core';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/rsbuild';

export default defineConfig({
	plugins: [tanstackStart()],
});
```

The Rsbuild plugin installs the Octane Rspack compiler and Start's native
Rsbuild adapter together. It creates separate `client` and `ssr` environments,
emits production assets to `dist/client` and the fetch-style server entry to
`dist/server`, and provides the same route generation, server functions,
streaming SSR, import protection, and prerendering behavior as the Vite entry.

Application code imports Start APIs from this package and router APIs from the
Octane router binding:

```ts
import { createServerFn } from '@octanejs/tanstack-start';
import { createFileRoute } from '@octanejs/tanstack-router';
```

## Compiled Router integration

Use `tanstackStart({ compiled: true })` in either build plugin for routes authored
as compiled Octane template bodies. This selects matching default Start entries,
route scaffolds, generated route-tree imports, and lazy route imports. Existing
custom `client.entry` and `server.entry` options retain precedence.

Import routing APIs from `@octanejs/tanstack-router/compiled` throughout that
route tree. A custom client entry uses `StartClient` and `hydrateStart` from
`@octanejs/tanstack-start/compiled/client`; a custom server uses `StartServer`,
`defaultStreamHandler`, or `defaultRenderHandler` from
`@octanejs/tanstack-start/compiled/server`. The package-root server-function APIs
remain unchanged. Do not mix the ordinary and compiled Router contexts.

The compiled Start components retain the existing document hydration owner and
ready acknowledgement. The option selects the compiled rendering boundary; it
does not declare the entire Router or Start package Strong-compliant.

## Public entries

- `@octanejs/tanstack-start`
- `@octanejs/tanstack-start/client`
- `@octanejs/tanstack-start/server`
- `@octanejs/tanstack-start/compiled/client`
- `@octanejs/tanstack-start/compiled/server`
- `@octanejs/tanstack-start/plugin/vite`
- `@octanejs/tanstack-start/plugin/rsbuild`
- RPC and environment-marker entries used by the Start compiler
- `@octanejs/tanstack-start/server-entry`

The compiler and generator internals are implementation details and are not
public package exports.

## Upstream basis

The renderer adapter is derived from TanStack Router pull request #7847 at
snapshot `753f919e`, with repository-owned fixes for TSRX typing and Octane's
native streamed HTML injection. See `THIRD_PARTY_NOTICES.md` for attribution.
