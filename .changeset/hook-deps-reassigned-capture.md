---
'octane': patch
---

Run a hook with an omitted dependency array on every render when its callback reads a local variable that the component assigns again after the hook call, or assigns from a nested function. The compiler read the variable where the hook is called to fill the inferred array, so the array held the earlier value. The hook did not re-run when only the later value changed, while the callback read that later value. React runs a hook with an omitted array on every render, and Octane now does the same in this case. A variable assigned before the call keeps its inferred dependency. Strong mode reports `OCTANE_STRONG_UNTRACKED_EFFECT` instead, asking for the assignment to finish before the hook.
