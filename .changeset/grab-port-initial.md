---
'@octanejs/grab': patch
'octane': patch
---

Add `@octanejs/grab`, an Octane port of `react-grab@0.2.0`: hold a hotkey, click any element, and copy its component stack, source location, and HTML context to the clipboard for AI coding agents. Ships the full public surface — `init`, `initReturnServerPlugin`, plugin registry, and the `core`/`primitives` subpath exports — with Octane-authored instrumentation for component-name and source-location resolution.

Expose read-only root and child-scope observations through the optional Octane devtools hook so the Grab integration can resolve component stacks and authored source locations.
