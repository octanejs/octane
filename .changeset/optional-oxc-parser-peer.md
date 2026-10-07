---
'octane': minor
'@octanejs/cli': patch
---

Move `@tsrx/oxc` from a dependency to an optional peer. Projects that use the
Octane compiler in Node, including through Vite, Rspack, or Rsbuild, must
install `@tsrx/oxc@0.16.0` in the project using the compiler. Applications that
use only the Octane runtime do not need it.

The Octane CLI installs the compatible compiler peer when creating or setting
up an application.
