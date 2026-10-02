---
'octane': patch
---

Read a component's signal and query declarations from its own `@try`, `@pending`,
`@catch`, `@if` and `@switch` arms and keyed `@for` rows without creating a second
cell. A query declared in setup and read again from one of those frames, directly
or through a local `derived$`, now starts one request on the client and resumes
the server's request during hydration, instead of starting another request per
arm or row. A component's own signal displayed in an arm also keeps its value
when that arm remounts.

An arm or row still owns the declarations it evaluates itself and resets them
when it is removed, and a child component that receives a handle as a prop still
resolves it in its own instance.
