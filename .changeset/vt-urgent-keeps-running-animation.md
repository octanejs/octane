---
"octane": patch
---

An urgent update (`flushSync`, an event's `setState`, or a layout-effect `setState`) no longer skips a View Transition whose update callback already committed. Like React, it skips only a transition that is still preparing; once the animation runs, the urgent commit changes the live DOM under it.
