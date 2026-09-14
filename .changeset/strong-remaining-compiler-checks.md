---
'octane': patch
'@octanejs/cli': patch
'@octanejs/mcp-server': patch
'@octanejs/mdx': patch
---

Complete the remaining Strong compiler checks for fetch-driven effects, effect chains, prop-derived initial state, explicit and null dependencies, manual memo hooks, JSX list mapping, index keys, suppression props, trusted HTML, and compatibility imports. Preserve equivalent dependency arrays as hints and report them without failing strict CLI analysis. Add compiler-owned declaration caching for Strong authoring, the `trustHTML`/`TrustedHTML` API, and nominal Strong JSX types while preserving compatibility modules.

Strong opt-in intentionally changes generated code for eligible hook-input declarations: their identities are cached in development and production until inferred inputs change. It also normalizes proven built-in hook aliases and infers dependencies for unshadowed `undefined` placeholders. This applies to both the directive and the global `strong: true` option. Ordinary callbacks and mutable values retain their authored evaluation and lifetime. The keyed `@for` migration applies to `.tsrx`; keyed JSX mapping remains supported in `.tsx`.

CLI JSON reports include the hint count even when it is zero, and MDX diagnostic types represent errors, warnings, and hints.

The eager prop-state check covers both `useState(value)` and `useReducer(reducer, value)`. A lazy state initializer or explicit third reducer initializer declares a deliberate initial capture. Subscription and timer callbacks keep their event-driven semantics and are excluded from effect-chain writes.
