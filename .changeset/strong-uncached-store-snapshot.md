---
'octane': minor
---

Strong mode now rejects a `useSyncExternalStore` `getSnapshot` or
`getServerSnapshot` that provably returns a new object or array on every call
(`OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT`), such as a literal, a spread copy,
`.map()`, `.filter()`, `Object.keys()`, a standard constructor, or a
same-module function or local constant that allocates. Snapshots are compared
with `Object.is`, so such a component warns in development and then renders
until the update-depth limit throws. Return a value the store keeps, or read
each field with its own `useSyncExternalStore` call. Compatibility mode is
unchanged.
