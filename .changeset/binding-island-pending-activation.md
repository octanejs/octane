---
'octane': patch
---

Keep a binding island's server content and input while its client data is still loading at activation:

- A `@try` in a `'use dom bindings'` view no longer replaces server-rendered content with `@pending` when the client's own read is still pending. Like the renderer's resolved boundary, the server content stays and hydrates in place when the read settles; its handlers and mount-only effects start with that commit. After the first commit, a later pending read shows `@pending` as before.
- An island whose binding view suspends outside `@try` on its first render no longer loses input. Clicks captured before activation, and input that reaches the island before its data arrives, now wait for the first commit and then replay in order. Input held by an island that is disposed before it commits is dropped.
