---
"@octanejs/app-core": patch
"@octanejs/rspack-plugin": patch
"octane": patch
---

Prevent production API errors and static-file symlinks from disclosing server details or files outside the built asset tree. Preserve injected HTML and settle streaming SSR when callbacks fail, and compile imported descriptor-children components correctly through Rspack and Rsbuild.
