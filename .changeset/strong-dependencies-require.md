---
'octane': minor
'@octanejs/app-core': minor
'@octanejs/cli': patch
'@octanejs/vite-plugin': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Packages can declare Strong mode in their package.json with `"octane": { "strong": true }`, or with a list of paths such as `["src"]`. Declared modules compile under Strong in every consumer. Applications can require Strong dependencies with `compiler.strongDependencies: { require: true, allow: [] }` (needs `compiler.strong`). The build then fails with `OCTANE_STRONG_DEPENDENCY` at any import that reaches a non-Strong module in another Octane package, or an `octane/react` boundary, unless `allow` names the package or `"octane/react"`. `octane analyze` reports the same errors, and `--strong-dependencies` now shares the compiler's walk.
