---
'@octanejs/cli': minor
---

Export the binding catalog as `@octanejs/cli/data`, `octane analyze --fix`'s
edit application as `@octanejs/cli/fix`, and the project helpers `findRoot` and
`scanSourceFiles` from the package root, so `@octanejs/codemod` finds sources,
maps React packages, and applies compiler fixes exactly as the CLI does.

Project scans skip `out/` as build output, as they already skipped `dist/` and
`build/`.
