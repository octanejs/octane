---
'octane': patch
---

Avoid reconciling unchanged compiler-cached renderable children while preserving
context and hidden-tree effect lifecycles, cache safe derived values in
hook-using JSX components, and omit fetch-warming scaffolding from component
trees proven to contain no asynchronous work.
