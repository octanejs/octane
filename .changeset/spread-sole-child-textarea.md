---
'octane': patch
---

Server rendering no longer wraps the only renderable child of a host that has
a spread in hydration markers, matching how the client mounts that child.
Inside a `<textarea>`, whose content the HTML parser keeps as text, those
markers became part of the default value: `<textarea {...rest}>{value}</textarea>`
showed `<!--[-->A<!--]-->` before hydration, and hydration then reported a text
mismatch. The markers also stopped a server-rendered `<option {...rest}>{label}</option>`
without a `value` from matching its select's `value` or `defaultValue`, so the
wrong option was selected until hydration.

Updating the child of a `<textarea>` that has a spread also no longer empties
it. Authored textarea children are a live text binding, but every update after
mount cleared the default value when the spread supplied no `value` or
`defaultValue`, which detached the child's text.
