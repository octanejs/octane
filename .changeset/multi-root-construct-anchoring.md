---
"octane": patch
---

Compiler: fix top-level control-flow placement in multi-root bodies.

- **Constructs between static roots now render at their source position.** A
  top-level `@if`/`@for`/`@switch`/`@try`/`<Activity>` in a multi-root
  (fragment-root) body used to be appended at the end of the block — after
  later static siblings — and, worse, still advanced the template child index,
  so any BOUND static sibling after the construct resolved the wrong template
  path and crashed the mount walk. Such constructs now emit a `<!>` anchor at
  their child index (exactly like the in-element mixed-children path) and the
  child index only advances for nodes that actually contribute template HTML.

- **Control-flow-only bodies anchor at the block end marker.** A component
  whose body is ONLY a `@for`/`@switch`/`@try` rendered its content outside the
  component's block range (after later siblings of the component) because the
  `__block.endMarker` fallback existed only on the `@if`/component emit paths.
  The anchor selection is now one shared helper across all construct emits, so
  the fallback applies uniformly and the emit sites can't drift again.
