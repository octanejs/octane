---
"octane": patch
---

`onFocus` / `onBlur` handlers now fire. They were treated as delegated events but the
single root listener was attached in the bubbling phase — and `focus`/`blur` don't
bubble, so the handlers never ran. They are now delegated in the **capture** phase, so
the dispatcher (which walks from `event.target` upward) reproduces React's bubbling
`onFocus`/`onBlur` semantics (the target handler fires, then each ancestor's). Other
event types keep the cheaper bubbling-phase delegation. This is what lets focus-driven
UI — e.g. a focus trap's guards — work.
