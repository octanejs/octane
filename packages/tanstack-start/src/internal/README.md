# Start integration internals

These modules are the package-owned Router generator, Router build-tool
plugins, and Start compiler cores used by the Octane Vite and Rsbuild adapters.
They are derived from the TanStack framework-adapter snapshot identified in the
package notice, with Octane package-name mapping and repository fixes applied.

They are committed as executable ESM because the build plugins must load from a
published package in plain Node before an application build exists. Internal
package-import aliases keep the implementation layers private while allowing
their original module boundaries to remain reviewable.

When updating the upstream basis, preserve the local package-name helpers,
TSRX source masking, compiler-before-router plugin order, native streaming
injection, and focused integration tests.
