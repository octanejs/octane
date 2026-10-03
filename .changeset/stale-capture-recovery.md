---
'octane': patch
---

Stop reporting hydration mismatches, and stop keeping old server values, when a
`<Hydrate>` boundary's props changed before it activated.

When a boundary's captures change before it activates, the server HTML predates
the client's state, so activation is meant to repair it silently. Several
recovery sites still called `onRecoverableError`, in development and production,
and logged a development warning. This happened when a renderable hole's server
text became a component, when a `createElement` child list shrank, and when a
dynamic host tag changed. Every recovery site is now quiet under changed
captures. Unchanged captures still report a mismatch as before.

Under changed captures, `suppressHydrationWarning` and `dangerouslySetInnerHTML`
also kept the server's value after activation, which was older than the client's
state. An element could show old text and attributes next to siblings that
showed the new ones, and `dangerouslySetInnerHTML` also logged a false
development warning. Activation now writes the client's text, attributes, class,
style, and HTML in these cases. With unchanged captures, both still keep the
server's value.
