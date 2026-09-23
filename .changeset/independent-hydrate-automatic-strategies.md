---
'octane': patch
---

Independent `<Hydrate>` widgets now activate on `idle()`, `visible()`, and
`media()`.

Before this change only `load()` and captured interactions activated an
independent island. A widget with `when={idle()}`, `visible()`, or `media(q)`
compiled cleanly and server-rendered its strategy, but the island bootstrap
never installed a trigger, so the widget stayed inert until it was clicked.
Its effects, timers, and subscriptions never started.

The server now writes each of these strategies' non-default parameters on the
independent boundary. The bootstrap installs the same idle callback,
`IntersectionObserver`, or `matchMedia` listener that ordinary boundaries use.
It removes a pending trigger on pause and dispose, and re-installs it on resume.

`condition()` and a function-form `when` need the lexical parent to re-evaluate
them, so they cannot drive an independent widget. The compiler rejects either
form when written directly (`OCTANE_HYDRATE_INDEPENDENT_WHEN`). An opaque `when`
value that resolves to either one makes server rendering throw instead of
shipping a widget that never activates.
