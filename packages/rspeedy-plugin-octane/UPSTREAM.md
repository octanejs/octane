# Upstream boundary

The Phase 1 integration targets `@lynx-js/rspeedy@0.16.0` and the immutable
compatibility evidence in `packages/lynx/audit/toolchain.json`.

The plugin uses Rspeedy's public Rsbuild plugin API and Octane's existing
`@octanejs/rspack-plugin`. It deliberately does not copy ReactLynx's Rsbuild
plugin, React/Preact aliases, React Refresh integration, component runtime, or
private lifecycle injection hooks.

Rspeedy is Apache-2.0 licensed. No Rspeedy source is vendored or adapted here.
