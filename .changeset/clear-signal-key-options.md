---
'octane': patch
---

Move explicit declaration keys to trailing options: `signal$(initial, { key })`, `derived$(compute, { key })`, and `query$(select, load, { key })`. This replaces their positional authored-key overloads; update existing callers when adopting this beta API change. Compiler-generated identities and explicit `createScope` methods retain their existing ownership behavior.
