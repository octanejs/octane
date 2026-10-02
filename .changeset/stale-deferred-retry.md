---
'octane': patch
---

Keep the server DOM intact when a deferred `Hydrate` boundary retries after its captures changed. If a mounted parent updated a boundary while its first activation was suspended, the retry rendered new content over server nodes that other blocks had already adopted. That content was a component swapped in by a dynamic call, a row inserted into a keyed list, or a renderable hole's new component, list, or text. Rows went missing, a sibling's server node was replaced, and the swap reported a false hydration mismatch. Content an update creates during hydration now builds on the client beside the adopted nodes, including when it suspends and a later retry resumes it, and nothing is reported.
