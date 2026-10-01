---
'octane': patch
'@octanejs/mcp-server': patch
---

Require Strong effect cleanup to actually cancel or ignore asynchronous state updates. `OCTANE_STRONG_EFFECT_DATA_FETCH` now covers any state update after an `await` or in a `.then`, `.catch`, or `.finally` callback of effect-owned work, not only `fetch`. The returned cleanup must abort an `AbortController` whose `signal` reaches the request, or assign a flag declared in the effect that guards the update after the last `await`. Empty, opaque, and unconnected cleanups, component- or module-scoped flags, and ref flags are errors. Compatibility modules and emitted code are unchanged.
