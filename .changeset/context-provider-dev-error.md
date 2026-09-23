---
'octane': patch
---

Throw a migration error in development when code reads `Context.Provider`.

`Context.Provider` was removed in favor of rendering the context itself as the
provider (`<Ctx value={…}>`). The compiler already rejects `<Ctx.Provider>` when
`createContext` is in the same module. When the context is imported from another
module, however, the client used to fail with "Element type is invalid … got:
undefined" and the server with "comp is not a function". Neither message
mentioned the migration.

In development, reading `.Provider` on a context from `octane` or `octane/server`
now throws `[OCTANE_CONTEXT_PROVIDER] Context.Provider was removed. Render the
context itself as the provider: <Context value={...}>...</Context>.` The
`.Consumer` warning now shares the same development-only helper. Production
bundles are byte-identical, and `.Provider` there is still `undefined`.
