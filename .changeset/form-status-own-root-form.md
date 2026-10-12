---
'octane': patch
---

`useFormStatus` no longer reports the status of a `<form>` that its own component renders as its single root element. Only an ancestor form counts, as in React.
