---
'octane': minor
---

Render computes, commit writes, for compiled template bindings. An update now
records changed text, attribute, class, style, event-handler and
controlled-form values, and a commit function the compiler generates per
template writes them at commit, before refs and effects. A transition or
other render that is dropped never touches the DOM, and an event during a held
transition calls the committed handler.

As in React, an update coerces attribute and style values while it commits, so
an error from a value's `toString` reaches the nearest error boundary as a
commit-phase error instead of a render error. Mounts still write as they render.
