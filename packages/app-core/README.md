# `@octanejs/app-core`

Bundler-neutral app primitives shared by Octane's Vite and Rsbuild integrations. Most applications should install the integration for their build tool and import `defineConfig`, routes, and middleware from that package; integration and adapter authors can depend on app-core directly.

## Public surfaces

- `@octanejs/app-core/config` validates and resolves declarative `octane.config.ts` values.
- `@octanejs/app-core/config-loader` loads TypeScript config files with either an injected development module runner or a neutral esbuild evaluator. `loadOctaneConfigWithMetadata` reports existing and missing dependencies for watch and cache invalidation.
- `@octanejs/app-core/routes` and `/middleware` provide the router and Fetch API request pipeline.
- `@octanejs/app-core/html`, `/production`, and `/node` provide streaming HTML composition, the production Fetch handler, and the optional Node HTTP bridge.
- `@octanejs/app-core/codegen` generates client hydration entries, template-free server manifests, and production server entries. Runtime module IDs, integration module IDs, generated-file directories, and application import specifiers are explicit inputs so generators remain usable across bundlers and renderer targets.

Development integrations should inject their native module runner into `loadOctaneConfigWithMetadata`. The neutral evaluator is intended for configuration/build discovery: it bundles static JS, TS, and server-compiled TSRX helpers, while preserving dynamic application imports as lazy watched references so config loading never traverses renderer-only asset graphs.

```js
import {
  create_client_entry_source,
  generateServerManifestEntry,
} from '@octanejs/app-core/codegen';

const clientEntry = create_client_entry_source({
  staticEntries: [{ id: '/src/Page.tsrx', specifier: '/absolute/app/src/Page.tsrx' }],
});

const serverEntry = generateServerManifestEntry({
  routes,
  octaneConfigPath: '/absolute/app/octane.config.ts',
  moduleImports: {
    '/src/Page.tsrx': '/absolute/app/src/Page.tsrx',
  },
});
```

Stable application IDs stay in route manifests and hydration data; only generated `import` specifiers are mapped to a bundler-resolvable path.
