---
'octane': patch
---

A function a component or hook creates now uses the signal cells that body
declared, wherever the function runs. Previously a Retry callback passed to a
child button reset a cell in the child, so a failed `query$` stayed in its
`@catch` arm and its loader ran again for nothing. The same happened to a
callback a child calls while rendering, which started a second query, and to
code after `await`, which resolved a document-level cell.

The compiler routes method calls such as `result$.reset()` on a body's `const`
declarations, inside the functions that body creates, through the declaring
instance, arm or row. Once that owner retires, such a call throws
`ScopeDisposedError`. A handle passed to a child as a prop still resolves in the
child's own instance, and `signal$`, `derived$`, `query$` and Scope producer
closures keep their reader ownership.
