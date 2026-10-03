---
'octane': patch
---

Adopt the server's nodes when a list item suspends while a deferred `<Hydrate>` boundary hydrates. A component that returns JSX passes the boundary its children as descriptors, so a host's children there hydrate as a list. When the first item's first render suspended, the boundary's retry filled that list again from wherever the resumed render had left the cursor. It reported a hydration mismatch, rebuilt the item on the client, and duplicated server nodes such as the item's first root. The retry now adopts the list from its first server item, as a compiled `@for` does. An item whose render suspends inside a hydrating `@if` or `@switch` arm the server rendered no range for also leaves the server's nodes as they were, so the retry adopts that arm instead of rebuilding it.
