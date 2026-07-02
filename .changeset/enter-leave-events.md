---
"octane": patch
---

`onPointerEnter`/`onPointerLeave`/`onMouseEnter`/`onMouseLeave` now fire.

The enter/leave event family doesn't bubble, so octane's bubble-phase root
delegation never received these events — the handlers silently never fired
(unless the element was the delegation root itself). They are now delegated in
the capture phase (the same treatment focus/blur already had), but dispatched to
the **target only**: the browser sends each entered/left element its own event,
so the focus/blur ancestor walk would double-fire ancestors. This matches both
native semantics and React (whose enter/leave events don't bubble either).
