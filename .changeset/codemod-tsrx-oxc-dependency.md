---
'@octanejs/codemod': patch
---

`npx @octanejs/codemod` now runs from a clean environment. The codemod verifies each migrated module with the Octane compiler it installs, and that compiler needs `@tsrx/oxc`, which `octane` declares only as an optional peer. The codemod did not install it, so every run on a project without Octane installed failed with `Cannot find package '@tsrx/oxc'`. The codemod now depends on `@tsrx/oxc` at the version `octane` peers on.
