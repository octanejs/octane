---
'@octanejs/rspack-plugin': minor
'octane': patch
---

Rspack production client builds now specialize roots and component calls over
imported void components, as the Vite plugin already does. Before, a
`createRoot` or `hydrateRoot` root over a compiled `@{}` component imported from
another module kept the generic returned-value renderer. The issue's one-root
`hydrateRoot` app drops from about 86 KB to 52 KB gzip.

The plugin proves each import from the module graph after make, then compiles
the importer once more with the proof. An import is proven only when Octane
compiled it as a void export and the provider's final JavaScript, after SWC and
every later loader, still cannot return a value. The importer's final code must
also bind it to the same module and export. A loader that changes either keeps
the generic path. A proven module that changes later, such as through another
plugin's rebuild, fails the build. Watch, development, HMR and profiling builds
stay generic, as do builds with a custom `runtime`, `universalRuntime` or
`layerSpecializations`.

`octane/compiler/bundler` adds `analyzeCompiledModule(source, id)`, which reads
these facts from a module's final JavaScript for bundler adapters.
