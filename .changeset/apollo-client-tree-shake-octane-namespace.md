---
'@octanejs/apollo-client': patch
---

Stop `getApolloContext` from retaining every public `octane` export.

The Apollo context guard tested `'createContext' in React` against a namespace
import of `octane`. An `in` test forces bundlers to materialize the whole
namespace object, so every app using the binding kept the generic
`createRoot`/`hydrateRoot`, the returned-value reconciler and the transition
graph even when the compiler had specialized its root. The guard now checks a
named `createContext` import, which keeps the same failure behavior and lets
unused `octane` exports tree-shake. The `examples/cinebase` production bundle
drops from 203.73 kB to 151.67 kB gzip.
