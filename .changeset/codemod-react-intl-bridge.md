---
'@octanejs/codemod': patch
---

Migrate supported React Intl providers, scalar formatter reads, and plain messages through a shared project-local adapter. Keep the project's React Intl dependency for formatting and preserve its locale across supported React component boundaries. Inline rich-text callbacks with a single native tag can keep producing React elements inside a retained React component.

Strong migrations can preserve effects keyed by object identity when a callback reads a property or calls a method on an immutable local receiver.
