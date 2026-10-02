---
'octane': patch
---

A calculated descriptor array rendered as an element's only child inside a
component's children body skips reconciliation again while it is unchanged. Since
renderable holes started accepting signal handles, these holes lost the compiler's
cached-array region. Every parent update then walked the unchanged list and its
items. The region now wraps the signal-capable binding. A signal handle, or any
other value that is not an unchanged plain data array, still rebinds on every
render, and switching back to a previously cached array rebuilds it.
