---
'octane': patch
---

Compile JSX written inside a host element's attribute, such as an event handler
that calls `root.render(<Toast label="saved" />)` or `title={String(<Badge />)}`.
The compiler used to leave that JSX unlowered, so the emitted module failed to
parse. It now builds the same element it would anywhere else, on the client and
the server, including when a handler is a setup `const` the compiler installs
at mount and when a statement-bodied handler moves to module scope.
