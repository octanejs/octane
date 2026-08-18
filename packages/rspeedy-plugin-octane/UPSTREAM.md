# Upstream boundary

The Milestone 5 integration targets `@lynx-js/rspeedy@0.16.0` and the exact
framework-neutral compatibility evidence in
`packages/lynx/audit/toolchain.json`.

The plugin uses Rspeedy's public Rsbuild plugin API, Octane's existing
`@octanejs/rspack-plugin`, and the published template, CSS extraction, runtime
wrapper, development transport, encoder, and Web encoder contracts. The
ReactLynx Rsbuild plugin at the pinned Lynx-stack release was audited for its
public dual-layer graph and option interactions. This implementation was
written independently around those public APIs; no upstream implementation
source was copied or adapted. It deliberately omits React/Preact aliases, React
Refresh, the ReactLynx component runtime, and private lifecycle injection hooks.

Rspeedy is Apache-2.0 licensed. No Rspeedy source is vendored or adapted here.
