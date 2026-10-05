---
'octane': patch
---

Keep the `key` on a `<Fragment key={…}>` written in a `.tsrx` template, so a new
key remounts its children as it does in React.

The template compiler inlined a long-form Fragment's children and dropped its
key, both in a `@{ … }` body and in a directive arm such as `@try` or `@if`.
Changing the key therefore kept the children's state, effects, and a caught
`@try` error. A keyed Fragment now renders through the same keyed descriptor
boundary as a keyed host element, on the client, on the server, and during
hydration. This also covers a keyed Fragment with directive children in
returned JSX. Unkeyed Fragments still compile to their inlined children.
