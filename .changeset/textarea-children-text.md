---
'octane': patch
---

A `<textarea>` with more than one child now renders its children as one run of
text on both the client and the server. The HTML parser keeps markup and comments
inside a textarea as literal text, so the hydration markers used between
children became part of its value. `<textarea>hello {name as string}</textarea>`
threw "Cannot read properties of null" on a client-only mount. Server rendering
showed `hello <!-- -->A` until hydration, which then reported a mismatch.
`<textarea>hello {name}</textarea>` and `<textarea>{a}{b}</textarea>` mounted
with a literal `<!>` in the value, and hydration rebuilt the textarea. The same
text rule applies to textareas made by `createElement`, stored
JSX, and a `children` prop from a spread. These no longer report a hydration
mismatch or serialize array children with markers. A signal handle in a
compiled textarea's children stays live.

A textarea child must be text. Strings and numbers render, `null`, `undefined`
and booleans render nothing, and arrays or iterables of text are concatenated.
An element, function or other object now throws a clear error on both sides.
Before, the client inserted an element that the textarea's value ignored and the
server wrote it as literal text. An element, component, or template directive
written inside a `<textarea>` is a compile error.
