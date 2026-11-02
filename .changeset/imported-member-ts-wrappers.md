---
'octane': patch
---

Production builds now keep a keyed `@for` row live when it reads an imported object's member through a TypeScript wrapper, such as `flags!.enabled`, `(flags as Flags).enabled`, or `(flags satisfies Flags).enabled`. Before, the wrapper hid the read from the compiler's live-import check. A row such as `@if (flags!.enabled)` could then keep showing a stale branch after the member changed and the parent re-rendered with the same rows. The plain `flags.enabled` form was already handled.
