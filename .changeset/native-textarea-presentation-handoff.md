---
'octane': patch
---

Support explicit handoff of a standalone textarea signal value alongside an adopted native presentation. Hydration preserves live input and selection, transfers control ownership only at accepted publication, and keeps early bindings active when takeover is declined or suspended. Known-provider unbound style spreads retain direct compiled property bindings.

Keep early ownership intact when preparing a successor subscription fails, and avoid masking interrupted mounts with a secondary ref-cleanup error.

Release all prepared value successors when a later control invalidates presentation publication, preserving the original error and preventing stale input or model writers from being reclaimed by that root.

Reject competing presentation bindings for fields supplied by an unbound known-provider spread, including `class`/`className` aliases.

Type-check explicit scalar text intent against a signal handle's value in DOM templates, preserving direct bindings without application-side reads or unsafe casts.

Transfer direct scalar text signals through presentation hydration using the existing prepared binding lifecycle, including initially empty text ranges and live updates after acceptance.
