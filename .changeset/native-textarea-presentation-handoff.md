---
'octane': patch
---

Support explicit handoff of a standalone textarea signal value alongside an adopted native presentation. Hydration preserves live input and selection, transfers control ownership only at accepted publication, and keeps early bindings active when takeover is declined or suspended. Known-provider unbound style spreads retain direct compiled property bindings.

Keep early ownership intact when preparing a successor subscription fails, and avoid masking interrupted mounts with a secondary ref-cleanup error.

Reject competing presentation bindings for fields supplied by an unbound known-provider spread, including `class`/`className` aliases.
