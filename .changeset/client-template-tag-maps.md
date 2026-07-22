---
'octane': patch
---

Allow inspection tooling to opt into exact source-map anchors for host JSX tag
names baked into client template strings. Normal compiles keep the existing
path without tag-location allocations or scans.
