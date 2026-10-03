---
'octane': patch
---

Run state updates from insertion and layout effects at urgent priority, as React does during a commit. Previously an update from a layout effect that ran while an async Action was pending joined that Action and stayed hidden until it settled, and one from a commit flushed inside `startTransition` became a transition.
