---
'octane': patch
'@octanejs/vite-plugin': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Add a `requireDirective` option to every bundler integration for mixed-toolchain
codebases (for example a React app hosting Octane islands via `octane/react`).
When enabled, Octane compiles only project modules that open with a
`'use octane'` directive: undirected project `.tsx`/`.ts`/`.js` pass through to
the host framework's own pipeline (with a warning when they import from
`octane`), an undirected project `.tsrx` is a build error, and installed or
linked packages keep their Octane package-manifest decision. The directive
composes with `'use client'`, is stripped from compiled output, and is
tolerated even when the option is off.
