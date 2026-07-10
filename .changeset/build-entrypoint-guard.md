---
'octane': patch
---

Publish build: entry points are now globbed from `src/` instead of hand-listed — the hand-maintained list had silently drifted (css.ts, server/rpc.ts, static/index.ts were missing, so `dist/runtime.js`, `octane/server`, and `octane/static` shipped with unresolvable relative imports). A new post-build guard (`scripts/verify-dist.mjs`, also run in CI) makes the class of bug impossible to ship: every emitted dist module's relative imports must resolve (including the verbatim-copied `dist/compiler/`), every `publishConfig` export target must exist, and every published entry point must import cleanly in plain Node — otherwise the build fails.
