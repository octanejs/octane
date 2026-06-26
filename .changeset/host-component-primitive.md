---
"octane": patch
---

Add two runtime primitives for plain-TS (non-template) component bindings:

- `hostComponent` — render a host element (`<tag>`) that WRAPS a children render-body, with reactive props (className / style / events / ref) and the children rendered inside it via `childSlot`. The runtime counterpart of the compiled `<tag …>{children}</tag>` emission, for runtime-proxy host components (e.g. a `motion.div` factory). The wrapped children render-body is a fresh closure each parent render, so `hostComponent` hands `childSlot` a stable delegating body — without it a control-flow child (`@for`/`@if`) re-mounts and DOM-duplicates instead of reconciling on re-render.
- `provideContext(scope, context, value)` — programmatically provide a context value for a scope's descendants (the same stamping `<Context.Provider>` performs), so a plain-TS component that renders children can provide context without authoring a `.tsrx` Provider wrapper.

Both are used by the new `@octanejs/motion` (`motion.div`, `MotionConfig`, variant propagation).
