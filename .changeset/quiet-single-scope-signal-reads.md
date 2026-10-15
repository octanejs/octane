---
"octane": patch
---

Avoid allocating a scope lookup map for renders that sample signals from one scope, while keeping independent captures when additional scopes are read. Validate serialized retained signal owners without retaining optional transition operations.
