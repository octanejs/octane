---
"octane-ts": patch
---

Add the `hostComponent` runtime primitive — render a host element (`<tag>`) that WRAPS a children render-body from plain-TS (non-template) code, with reactive props (className / style / events / ref) and the children rendered inside it via `childSlot`. It's the runtime counterpart of the compiled `<tag …>{children}</tag>` emission, for runtime-proxy host components — e.g. a `motion.div` factory (see the new `@octane-ts/motion`).
