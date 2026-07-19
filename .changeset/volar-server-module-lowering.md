---
'octane': patch
---

`module server { … }` blocks now typecheck under the language tooling
(tsrx-tsc / Volar). The type-only pipeline used to pass the dialect through
verbatim, so the documented static import inside the block was TS1147 and the
companion `import { fn } from 'server'` was TS2307 in every consumer. The
Volar path now lowers the block before printing: block imports hoist to
module top level (aliased through a mangled namespace import when the client
half also uses the name), the block becomes a `namespace server` binding that
keeps the authored name and location, and `from 'server'` imports become
destructures of it — with authored locations preserved, so hover,
go-to-definition, and diagnostics still map back to the `.tsrx` source, and
`noUnusedLocals`-style checking stays clean. Runtime compilation is
unchanged.
