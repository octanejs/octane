---
'octane': patch
---

Fix a `<Hydrate>` activation that suspends on a child inside a hydrated component fragment.

- **Following components:** when the activation resumed, each component after that one in the same block found the hydration cursor still inside the earlier component's server range. It removed or duplicated server nodes, even when the server rendered exactly what the client did. Those components now adopt their own server ranges.
- **Client-built children:** a child that mounted inside content hydration rebuilt on the client now completes as a client render when it resumes. It no longer adopts a server node outside the rebuilt content.
- **Fragments with extra roots:** a component fragment that holds more roots than the server rendered in its range, such as a component call followed by text, is now rebuilt and reported once. It is no longer adopted over another component's content. Below a passthrough root, whose ranges can sit one level off, hydration keeps its previous behavior.
