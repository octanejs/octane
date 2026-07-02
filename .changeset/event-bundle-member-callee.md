---
"octane": patch
---

Event handlers whose body calls a METHOD now work (`onClick={() => obj.method(x)}`).

The compiler's event-bundle optimization extracted the callee into a stable `fn`
slot for identity-diffing — but extracting a member callee (`props.log.push`) loses
its receiver, so the dispatcher's bare `fn(...)` invocation ran the method with
`this === undefined` and threw mid-dispatch. Bundling is now restricted to plain
identifier callees (the hot path it was built for); member callees keep the
ordinary closure handler.
