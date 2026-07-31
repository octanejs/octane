---
'octane': patch
---

Evaluate an inline event handler's arguments when the event fires, not on every
render. `onClick={() => setData(makeData(1000))}` compiled to a `{ fn, args }`
bundle whose argument was lifted into the component body, so `makeData(1000)`
ran on mount and on every subsequent render even if the button was never
clicked. An argument is now bundled only when evaluating it early is
observationally equivalent to evaluating it on the event: identifiers, plain
member paths, literals, and operators over those. Calls, fresh array/object/regex
literals, mutations, `ref.current` (the ref attaches after the mount that would
read it, so the first event received the pre-attach `null`), and computed member
keys keep the ordinary closure handler.

Inline handlers that read nothing which can change between renders are now
installed once at mount instead of being rebuilt and reassigned on every render,
matching what a named handler already received. Handlers inside a keyed `@for`
row are excluded, since a surviving row can be handed a different item without
remounting.
